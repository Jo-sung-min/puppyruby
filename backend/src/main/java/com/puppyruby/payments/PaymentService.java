package com.puppyruby.payments;

import com.puppyruby.auth.AuthService;
import com.puppyruby.commerce.CommerceService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.*;

/** Provider calls always run outside the short claim/finalization database transactions. */
@Service
@Transactional(propagation = Propagation.NOT_SUPPORTED)
public class PaymentService {
    static final long CLAIM_MS = 60_000;
    static final long IDEMPOTENCY_MS = 15L * 24 * 60 * 60_000;
    private final AuthService auth;
    private final CommerceService commerce;
    private final PaymentOrderRepository orders;
    private final PaymentSettings settings;
    private final TossGateway gateway;
    private final PaymentRateLimiter limiter;
    private final ObjectMapper mapper;
    private final TransactionTemplate tx;
    public PaymentService(AuthService auth, CommerceService commerce, PaymentOrderRepository orders, PaymentSettings settings,
                          TossGateway gateway, PaymentRateLimiter limiter, ObjectMapper mapper, PlatformTransactionManager manager) {
        this.auth = auth; this.commerce = commerce; this.orders = orders; this.settings = settings;
        this.gateway = gateway; this.limiter = limiter; this.mapper = mapper;
        tx = new TransactionTemplate(manager); tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    public record Create(String productId, String requestId, Long catalogRevision, Boolean termsAccepted) {}
    public record Confirm(String orderId, String paymentKey, Integer amount) {}
    public record Created(String orderId, String orderName, int amount, int quantity, String kind, String customerKey, long createdAt, String status) {}
    public record OrderView(String orderId, String orderName, int amount, int quantity, String kind, String status, long createdAt,
                            Long paidAt, int refundedAmount, boolean ticketsGranted, String receiptUrl) {}
    public record History(List<OrderView> orders) {}
    public record Result(OrderView order, String message) {}
    public record Message(String message) {}
    private record Claim(String orderId, String paymentKey, int amount, int quantity, String kind, String accountId,
                         String token, String idempotencyKey, Long requestedAt, boolean canConfirm) {}

    public PaymentSettings.Config config() { return settings.config(); }

    public Created create(String session, Create input) {
        String account = auth.requireAccount(session).id;
        settings.requireEnabled();
        if (input == null || !Boolean.TRUE.equals(input.termsAccepted()) || input.catalogRevision() == null
            || input.catalogRevision() < 0 || input.productId() == null || !input.productId().matches("[A-Za-z0-9_-]{1,80}"))
            throw bad("상품과 필수 구매 약관 동의를 확인해 주세요.");
        String requestId = uuid(input.requestId());
        limiter.take("create:" + account, 30);
        try {
            return tx.execute(ignored -> {
                PaymentOrder existing = orders.findByAccountIdAndRequestId(account, requestId).orElse(null);
                if (existing != null) return replay(existing, input);
                var product = commerce.productForPurchase(input.productId());
                if (product.catalogRevision() != input.catalogRevision()) throw conflict("상품 정보가 변경됐어요. 새 가격과 안내를 확인해 주세요.");
                if (product.price() <= 0 || product.quantity() <= 0 || product.name().length() > 100)
                    throw unavailable("상품을 준비 중이에요. 잠시 뒤 다시 확인해 주세요.");
                PaymentOrder order = new PaymentOrder();
                order.id = "ruby_" + UUID.randomUUID().toString().replace("-", ""); order.accountId = account;
                order.requestId = requestId; order.productId = product.id(); order.catalogRevision = product.catalogRevision();
                order.orderName = product.name(); order.kind = product.kind(); order.quantity = product.quantity(); order.amount = product.price();
                order.customerKey = UUID.randomUUID().toString(); order.idempotencyKey = UUID.randomUUID().toString();
                order.mode = settings.mode(); order.createdAt = System.currentTimeMillis(); order.termsAcceptedAt = order.createdAt;
                orders.saveAndFlush(order);
                return created(order);
            });
        } catch (DataIntegrityViolationException concurrent) {
            // A concurrent retry has its own transaction. Re-read only after the losing transaction rolled back.
            return tx.execute(ignored -> replay(orders.findByAccountIdAndRequestId(account, requestId)
                .orElseThrow(() -> conflict("주문을 다시 확인해 주세요.")), input));
        }
    }

    public History history(String session) {
        String account = auth.requireAccount(session).id;
        return tx.execute(ignored -> new History(orders.findTop50ByAccountIdOrderByCreatedAtDesc(account).stream().map(PaymentService::view).toList()));
    }

    public Result confirm(String session, Confirm input) {
        String account = auth.requireAccount(session).id;
        settings.requireEnabled();
        if (input == null || input.amount() == null) throw bad("결제 정보를 확인해 주세요.");
        orderId(input.orderId()); paymentKey(input.paymentKey());
        limiter.take("check:" + account, 60);
        return run(claim(account, input.orderId(), input.paymentKey(), input.amount(), true, false), false);
    }

    public Result reconcile(String session, String id) {
        String account = auth.requireAccount(session).id;
        settings.requireEnabled(); orderId(id); limiter.take("check:" + account, 60);
        return run(claim(account, id, null, null, false, false), false);
    }

    public Message webhook(byte[] body) {
        if (body == null || body.length == 0 || body.length > 32_768) throw bad("웹훅 본문을 확인해 주세요.");
        limiter.take("webhook:global", 120);
        JsonNode json;
        try { json = mapper.readTree(body); } catch (RuntimeException invalid) { throw bad("웹훅 형식을 확인해 주세요."); }
        if (json == null || !json.isObject()) throw bad("웹훅 형식을 확인해 주세요.");
        // Normal payment webhooks are unsigned. They are only hints to query a previously bound key.
        if (!"PAYMENT_STATUS_CHANGED".equals(HttpTossGateway.value(json, "eventType"))) return new Message("접수했어요.");
        JsonNode data = json.path("data");
        String id = HttpTossGateway.value(data, "orderId"), key = HttpTossGateway.value(data, "paymentKey");
        if (id == null || !id.matches("[A-Za-z0-9_-]{6,64}")) return new Message("접수했어요.");
        boolean known = tx.execute(ignored -> orders.findById(id).filter(order -> order.paymentKey != null && order.paymentKey.equals(key)).isPresent());
        if (!known) return new Message("접수했어요.");
        settings.requireEnabled(); limiter.take("webhook:" + id, 12);
        run(claim(null, id, null, null, false, true), true);
        return new Message("확인했어요.");
    }

    private Claim claim(String account, String id, String key, Integer amount, boolean confirming, boolean webhook) {
        try {
            return tx.execute(ignored -> {
                PaymentOrder order = orders.lockById(id).orElseThrow(PaymentService::missing);
                if (account != null && !order.accountId.equals(account)) throw missing();
                if (!order.mode.equals(settings.mode())) throw conflict("이 주문은 현재 결제 환경과 달라요. 고객 지원에 문의해 주세요.");
                if (amount != null && order.amount != amount) throw bad("주문 금액과 결제 금액이 달라요. 결제를 다시 시작해 주세요.");
                if (key != null && order.paymentKey != null && !order.paymentKey.equals(key)) throw conflict("이 주문에 등록된 결제 정보와 달라요.");
                long now = System.currentTimeMillis();
                if (order.claimToken != null && order.claimUntil > now) throw conflict("결제를 확인 중이에요. 잠시 뒤 다시 확인해 주세요.");
                if (key != null && order.paymentKey == null) {
                    if (orders.findByPaymentKey(key).isPresent()) throw conflict("이미 다른 주문에 등록된 결제예요.");
                    order.paymentKey = key;
                }
                if (order.paymentKey == null) throw conflict("아직 결제창에서 인증하지 않은 주문이에요. 구매 화면에서 결제를 진행해 주세요.");
                if (confirming && order.confirmationRequestedAt == null) order.confirmationRequestedAt = now;
                order.claimToken = UUID.randomUUID().toString(); order.claimUntil = now + CLAIM_MS;
                if (!order.ticketsGranted && order.refundedAmount == 0 && !Set.of("ABORTED", "EXPIRED", "CANCELED").contains(order.status))
                    order.status = confirming ? "CONFIRMING" : "VERIFYING";
                orders.saveAndFlush(order);
                return new Claim(order.id, order.paymentKey, order.amount, order.quantity, order.kind, order.accountId,
                    order.claimToken, order.idempotencyKey, order.confirmationRequestedAt,
                    !webhook && order.confirmationRequestedAt != null && !order.ticketsGranted && order.refundedAmount == 0
                        && !Set.of("ABORTED", "EXPIRED", "CANCELED").contains(order.status));
            });
        } catch (DataIntegrityViolationException duplicateKey) { throw conflict("이미 다른 주문에 등록된 결제예요."); }
    }

    private Result run(Claim claim, boolean webhook) {
        boolean approvalAttempted = false;
        try {
            TossGateway.Payment payment = gateway.get(claim.paymentKey());
            if (payment != null && claim.paymentKey().equals(payment.paymentKey()) && payment.orderId() != null
                && payment.orderId().matches("[A-Za-z0-9_-]{6,64}") && !claim.orderId().equals(payment.orderId())
                && forgetForeignKeyBeforeApproval(claim)) throw new ForeignPayment();
            validate(claim, payment);
            if ("IN_PROGRESS".equals(payment.status()) && claim.canConfirm()) {
                // An old request may still be queried, but never approved again after the provider's idempotency window.
                if (System.currentTimeMillis() - claim.requestedAt() >= IDEMPOTENCY_MS)
                    return uncertain(claim, "IDEMPOTENCY_EXPIRED", "결제 확인 기한이 지나 승인을 다시 요청하지 않았어요. 고객 지원에 문의해 주세요.");
                tx.executeWithoutResult(ignored -> {
                    PaymentOrder current = orders.lockById(claim.orderId()).orElseThrow(PaymentService::missing);
                    if (!claim.token().equals(current.claimToken)) throw conflict("다른 요청에서 결제를 확인 중이에요.");
                    if (current.approvalSentAt == null) current.approvalSentAt = System.currentTimeMillis();
                });
                approvalAttempted = true;
                payment = gateway.confirm(claim.paymentKey(), claim.orderId(), claim.amount(), claim.idempotencyKey());
                validate(claim, payment);
            }
            TossGateway.Payment verified = payment;
            return tx.execute(ignored -> finish(claim, verified));
        } catch (ForeignPayment foreign) {
            throw conflict("다른 주문의 결제 정보예요. 원래 구매 화면에서 결제를 다시 확인해 주세요.");
        } catch (InvalidPayment mismatch) {
            uncertain(claim, "PROVIDER_MISMATCH", "결제 정보가 주문과 일치하지 않아요. 고객 지원에 문의해 주세요.");
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "결제 정보가 주문과 일치하지 않아 이용권을 지급하지 않았어요. 고객 지원에 문의해 주세요.");
        } catch (TossGateway.Failure transport) {
            if (approvalAttempted) {
                // Approval may have succeeded even when its response was lost. Query once; never issue a second approval here.
                try {
                    TossGateway.Payment recovered = gateway.get(claim.paymentKey()); validate(claim, recovered);
                    return tx.execute(ignored -> finish(claim, recovered));
                } catch (RuntimeException stillUnknown) { /* Persist retry information below. */ }
            }
            Result result = uncertain(claim, "PROVIDER_UNAVAILABLE", "결제 상태를 아직 확인하지 못했어요. 다시 결제하지 말고 구매 내역에서 상태를 확인해 주세요.");
            if (webhook) throw unavailable("결제 상태를 다시 확인해야 해요.");
            return result;
        } catch (RuntimeException finalizeFailure) {
            // The key/intent/UUID were committed before the provider call. A rolled-back wallet grant is retried by re-querying.
            Result result = uncertain(claim, "FINALIZATION_RETRY", "결제 결과를 저장하는 중이에요. 다시 결제하지 말고 잠시 뒤 상태를 확인해 주세요.");
            if (webhook) throw unavailable("결제 결과를 다시 저장해야 해요.");
            return result;
        }
    }

    private boolean forgetForeignKeyBeforeApproval(Claim claim) {
        return tx.execute(ignored -> {
            PaymentOrder order = orders.lockById(claim.orderId()).orElseThrow(PaymentService::missing);
            if (!claim.token().equals(order.claimToken) || order.approvalSentAt != null || order.ticketsGranted || order.refundedAmount != 0) return false;
            // A verified foreign order must not be able to reserve another member's payment key.
            // No approval was sent, so discard this unused intent and generate a fresh unused UUID.
            order.paymentKey = null; order.confirmationRequestedAt = null; order.idempotencyKey = UUID.randomUUID().toString();
            order.status = "CREATED"; order.lastFailure = "FOREIGN_PAYMENT_KEY"; release(order); return true;
        });
    }

    private Result finish(Claim claim, TossGateway.Payment payment) {
        PaymentOrder order = orders.lockById(claim.orderId()).orElseThrow(PaymentService::missing);
        if (!claim.token().equals(order.claimToken)) return new Result(view(order), "다른 요청에서 확인 중이에요. 잠시 뒤 새 상태를 확인해 주세요.");
        int canceled = canceledAmount(payment);
        boolean paid = Set.of("DONE", "PARTIAL_CANCELED", "CANCELED").contains(payment.status());
        // Out-of-order provider responses cannot undo refunds or return an already paid order to an unpaid state.
        if (canceled < order.refundedAmount || ((order.ticketsGranted || order.refundedAmount > 0) && !paid)) {
            release(order); return new Result(view(order), "가장 최근에 확인한 결제 상태를 유지했어요.");
        }
        if (paid) {
            if (!order.ticketsGranted && canceled < order.amount && order.refundedAmount == 0) {
                commerce.creditPaidTickets(order.accountId, order.kind, order.quantity, order.id);
                order.ticketsGranted = true;
            }
            int requiredReversal = (int) (((long) order.quantity * canceled + order.amount - 1L) / order.amount);
            if (order.ticketsGranted && requiredReversal > order.reversedQuantity) {
                commerce.revokePaidTickets(order.accountId, order.kind, requiredReversal - order.reversedQuantity,
                    "refund_" + order.id + "_" + requiredReversal);
            }
            order.reversedQuantity = Math.max(order.reversedQuantity, requiredReversal);
            order.refundedAmount = canceled;
            if (order.paidAt == null) order.paidAt = payment.approvedAt();
            order.receiptUrl = safeReceipt(payment.receiptUrl());
            order.status = payment.status();
        } else if (Set.of("ABORTED", "EXPIRED").contains(payment.status())) order.status = payment.status();
        else order.status = "VERIFYING";
        order.lastFailure = null; order.checkedAt = System.currentTimeMillis(); release(order); orders.saveAndFlush(order);
        return new Result(view(order), switch (order.status) {
            case "DONE" -> "결제가 완료됐어요. 이용권을 받았어요!";
            case "PARTIAL_CANCELED" -> "부분 환불을 확인하고 이용권 잔액에 반영했어요.";
            case "CANCELED" -> "취소된 결제예요. 환불된 이용권을 잔액에 반영했어요.";
            case "ABORTED", "EXPIRED" -> "완료되지 않은 결제예요. 상점에서 다시 시작해 주세요.";
            default -> "아직 결제가 완료되지 않았어요. 잠시 뒤 구매 내역에서 확인해 주세요.";
        });
    }

    private Result uncertain(Claim claim, String failure, String message) {
        return tx.execute(ignored -> {
            PaymentOrder order = orders.lockById(claim.orderId()).orElseThrow(PaymentService::missing);
            if (claim.token().equals(order.claimToken)) {
                if (!order.ticketsGranted && order.refundedAmount == 0 && !Set.of("ABORTED", "EXPIRED", "CANCELED").contains(order.status)) order.status = "VERIFYING";
                order.lastFailure = failure; release(order);
            }
            return new Result(view(order), message);
        });
    }
    private static void validate(Claim claim, TossGateway.Payment payment) {
        if (payment == null || !claim.paymentKey().equals(payment.paymentKey()) || !claim.orderId().equals(payment.orderId())
            || payment.amount() != claim.amount() || !"KRW".equals(payment.currency()) || payment.status() == null
            || !Set.of("READY", "IN_PROGRESS", "DONE", "PARTIAL_CANCELED", "CANCELED", "ABORTED", "EXPIRED").contains(payment.status())) throw new InvalidPayment();
        boolean paid = Set.of("DONE", "PARTIAL_CANCELED", "CANCELED").contains(payment.status());
        // Provider docs mark method/easyPay nullable before approval. Verify any available data early,
        // and require both fields in the approved/refunded response before granting tickets.
        if (paid || ("IN_PROGRESS".equals(payment.status()) && payment.provider() != null)) {
            if (!("토스페이".equals(payment.provider()) || "TOSSPAY".equals(payment.provider()))
                || (payment.method() != null && !("간편결제".equals(payment.method()) || "카드".equals(payment.method())))
                || (paid && payment.method() == null)) throw new InvalidPayment();
        }
        if ("IN_PROGRESS".equals(payment.status()) && payment.method() != null
            && !("간편결제".equals(payment.method()) || "카드".equals(payment.method()))) throw new InvalidPayment();
        int refunded = canceledAmount(payment);
        if (payment.balanceAmount() != payment.amount() - refunded) throw new InvalidPayment();
        switch (payment.status()) {
            case "DONE" -> { if (refunded != 0 || payment.approvedAt() == null) throw new InvalidPayment(); }
            case "PARTIAL_CANCELED" -> { if (refunded <= 0 || refunded >= payment.amount() || payment.approvedAt() == null) throw new InvalidPayment(); }
            case "CANCELED" -> { if (refunded != payment.amount() || payment.approvedAt() == null) throw new InvalidPayment(); }
            default -> { if (refunded != 0) throw new InvalidPayment(); }
        }
    }
    private static int canceledAmount(TossGateway.Payment payment) {
        long total = 0; Set<String> seen = new HashSet<>();
        if (payment.cancels() == null) throw new InvalidPayment();
        for (var cancel : payment.cancels()) {
            if (!"DONE".equals(cancel.status())) continue;
            if (cancel.amount() <= 0 || cancel.transactionKey() == null || cancel.transactionKey().isBlank()
                || !seen.add(cancel.transactionKey())) throw new InvalidPayment();
            total += cancel.amount();
        }
        if (total > payment.amount() || total < 0) throw new InvalidPayment();
        return (int) total;
    }
    static String safeReceipt(String value) {
        if (value == null || value.length() > 2048) return null;
        try {
            URI uri = URI.create(value); String host = uri.getHost();
            if (host == null || !"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) return null;
            host = host.toLowerCase(Locale.ROOT);
            return host.equals("tosspayments.com") || host.endsWith(".tosspayments.com") ? value : null;
        } catch (RuntimeException invalid) { return null; }
    }
    private static Created replay(PaymentOrder order, Create input) {
        if (!order.productId.equals(input.productId()) || order.catalogRevision != input.catalogRevision()) throw conflict("같은 주문 요청 번호에 다른 상품을 사용할 수 없어요.");
        return created(order);
    }
    private static void release(PaymentOrder order) { order.claimToken = null; order.claimUntil = 0; }
    private static Created created(PaymentOrder order) { return new Created(order.id, order.orderName, order.amount, order.quantity, order.kind, order.customerKey, order.createdAt, order.status); }
    private static OrderView view(PaymentOrder order) { return new OrderView(order.id, order.orderName, order.amount, order.quantity, order.kind, order.status, order.createdAt, order.paidAt, order.refundedAmount, order.ticketsGranted, order.receiptUrl); }
    private static String uuid(String value) {
        if (value == null || !value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw bad("주문 요청 번호를 확인해 주세요.");
        return value.toLowerCase(Locale.ROOT);
    }
    private static void orderId(String value) { if (value == null || !value.matches("[A-Za-z0-9_-]{6,64}")) throw bad("주문 번호를 확인해 주세요."); }
    private static void paymentKey(String value) { if (value == null || !value.matches("[A-Za-z0-9_-]{1,200}")) throw bad("결제 정보를 확인해 주세요."); }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private static ResponseStatusException unavailable(String message) { return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, message); }
    private static ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "주문을 찾을 수 없어요."); }
    private static final class InvalidPayment extends RuntimeException {}
    private static final class ForeignPayment extends RuntimeException {}
}
