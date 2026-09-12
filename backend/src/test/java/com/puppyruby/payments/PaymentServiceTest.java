package com.puppyruby.payments;

import com.puppyruby.auth.*;
import com.puppyruby.commerce.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:payment-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop",
    "MAIL_ENABLED=false", "ADMIN_EMAIL=", "TOSS_LIVE_ENABLED=false", "PUBLIC_SITE_URL=http://127.0.0.1:3001"
})
@Import(PaymentServiceTest.FakeProvider.class)
class PaymentServiceTest {
    static final String SECRET = "test_sk_" + UUID.randomUUID().toString().replace("-", "");
    static final String CLIENT = "test_ck_" + UUID.randomUUID().toString().replace("-", "");
    @DynamicPropertySource static void settings(DynamicPropertyRegistry properties) {
        properties.add("TOSS_SECRET_KEY", () -> SECRET); properties.add("TOSS_CLIENT_KEY", () -> CLIENT);
    }
    @TestConfiguration static class FakeProvider {
        @Bean @Primary ScriptedGateway scriptedGateway() { return new ScriptedGateway(); }
    }
    static class ScriptedGateway implements TossGateway {
        final Map<String, Payment> payments = new ConcurrentHashMap<>();
        final List<String> ids = new CopyOnWriteArrayList<>();
        final AtomicInteger gets = new AtomicInteger(), confirmations = new AtomicInteger();
        volatile String failAfterApproval, failBeforeApproval, failQuery;
        volatile boolean blockRecovery;
        volatile CountDownLatch entered, release;
        void reset() { payments.clear(); ids.clear(); gets.set(0); confirmations.set(0); failAfterApproval = null; failBeforeApproval = null; failQuery = null; blockRecovery = false; entered = null; release = null; }
        @Override public Payment get(String key) {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive(), "Provider query must not hold a database transaction");
            gets.incrementAndGet();
            if (key.equals(failQuery)) throw new Failure(false);
            return Optional.ofNullable(payments.get(key)).orElseThrow(() -> new Failure(true));
        }
        @Override public Payment confirm(String key, String order, int amount, String idempotency) {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive(), "Provider approval must not hold a database transaction");
            confirmations.incrementAndGet(); ids.add(idempotency);
            if (entered != null) {
                entered.countDown();
                try { assertTrue(release.await(10, TimeUnit.SECONDS)); } catch (InterruptedException interrupted) { throw new RuntimeException(interrupted); }
            }
            if (key.equals(failBeforeApproval)) { failBeforeApproval = null; throw new Failure(false); }
            Payment original = payments.get(key);
            Payment approved = payment(key, order, amount, "DONE", 0);
            assertEquals(original.amount(), amount); payments.put(key, approved);
            if (key.equals(failAfterApproval)) { failAfterApproval = null; if (blockRecovery) failQuery = key; throw new Failure(false); }
            return approved;
        }
    }
    @Autowired PaymentService service;
    @Autowired ScriptedGateway gateway;
    @Autowired PaymentOrderRepository orders;
    @Autowired AuthService auth;
    @Autowired AccountRepository accounts;
    @Autowired CommerceService commerce;
    @Autowired CommerceCatalogService catalog;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    @LocalServerPort int port;
    record User(Account account, String token) {}
    User user;
    @BeforeEach void setup() {
        gateway.reset(); user = newUser(); updateCatalog(true, null);
    }
    User newUser() {
        var result = auth.register(UUID.randomUUID().toString(), new AuthService.Register(UUID.randomUUID() + "@example.test", "PaymentTest!Password123", "결제 확인 회원"));
        return new User(accounts.findById(result.user().id()).orElseThrow(), result.token());
    }
    void updateCatalog(boolean enabled, Integer price) {
        var current = catalog.current();
        catalog.update(Map.of("expectedRevision", current.revision(), "salesEnabled", enabled,
            "products", current.products().stream().map(p -> Map.of("id", p.id(), "price", price == null ? p.price() : price, "enabled", true)).toList(),
            "pools", current.pools().stream().map(p -> Map.of("kind", p.kind(), "entries", p.entries().stream().map(e -> Map.of("id", e.id(), "weight", e.weight())).toList())).toList()));
    }
    PaymentService.Created create(String product) {
        return service.create(user.token, new PaymentService.Create(product, UUID.randomUUID().toString(), catalog.current().revision(), true));
    }
    String prepare(PaymentService.Created order) {
        String key = "payment_" + UUID.randomUUID().toString().replace("-", "");
        gateway.payments.put(key, payment(key, order.orderId(), order.amount(), "IN_PROGRESS", 0)); return key;
    }
    PaymentService.Result confirm(PaymentService.Created order, String key) { return service.confirm(user.token, new PaymentService.Confirm(order.orderId(), key, order.amount())); }
    long tickets() { return commerce.me(user.token).tickets().get("dog"); }
    static TossGateway.Payment payment(String key, String id, int amount, String status, int refund) {
        return new TossGateway.Payment(key, id, amount, amount - refund, "KRW", "간편결제", "토스페이", status,
            Set.of("DONE", "PARTIAL_CANCELED", "CANCELED").contains(status) ? System.currentTimeMillis() : null,
            "https://dashboard.tosspayments.com/receipt/test", refund == 0 ? List.of() : List.of(new TossGateway.Cancel(refund, "DONE", "cancel-" + refund)));
    }
    void rejected(int status, Runnable action) { assertEquals(status, assertThrows(ResponseStatusException.class, action::run).getStatusCode().value()); }
    HttpResponse<String> http(String method, String path, String token, String body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/payments" + path)).timeout(Duration.ofSeconds(10));
        if (token != null) request.header("X-Session-Token", token);
        request.header("X-Player-Id", user.account.playerId);
        if (body == null) request.GET(); else request.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(body));
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test void configExposesOnlyClientKeyAndAllPurchaseEndpointsRequireActiveSession() throws Exception {
        var config = http("GET", "/config", null, null);
        assertEquals(200, config.statusCode()); assertTrue(config.body().contains(CLIENT)); assertFalse(config.body().contains(SECRET)); assertFalse(config.body().contains("api.tosspayments"));
        assertEquals(401, http("GET", "/orders", null, null).statusCode());
        assertEquals(401, http("POST", "/orders", null, "{}").statusCode());
        assertEquals(401, http("POST", "/confirm", null, "{}").statusCode());
        assertEquals(401, http("POST", "/orders/ruby_missing/reconcile", null, "{}").statusCode());
        user.account.status = Account.Status.SUSPENDED; accounts.save(user.account);
        rejected(403, () -> service.history(user.token)); rejected(403, () -> create("dog-1"));
        assertEquals(0, gateway.gets.get()); assertEquals(0, gateway.confirmations.get());
    }

    @Test void serverFreezesPriceQuantityAndConsentAndRetriesSameCreationWithoutDuplicating() {
        long revision = catalog.current().revision(); String request = UUID.randomUUID().toString();
        rejected(400, () -> service.create(user.token, new PaymentService.Create("dog-10", request, revision, false)));
        rejected(409, () -> service.create(user.token, new PaymentService.Create("dog-10", request, revision - 1, true)));
        var input = new PaymentService.Create("dog-10", request, revision, true); var first = service.create(user.token, input);
        assertEquals(10, first.quantity()); assertNotEquals(user.account.id, first.customerKey()); assertTrue(first.customerKey().contains("-"));
        updateCatalog(true, first.amount() + 100);
        assertEquals(first, service.create(user.token, input));
        rejected(409, () -> service.create(user.token, new PaymentService.Create("aura-10", request, revision, true)));
        var stored = orders.findById(first.orderId()).orElseThrow(); assertTrue(stored.termsAcceptedAt > 0); assertNotNull(stored.termsVersion);
        assertEquals(first.amount(), stored.amount); assertEquals(1, service.history(user.token).orders().size());
        String key = prepare(first); assertEquals("DONE", confirm(first, key).order().status()); assertEquals(10, tickets());
    }

    @Test void salesDisabledOwnershipAndTamperedAmountNeverReachProvider() {
        var order = create("dog-1"); String key = prepare(order); User other = newUser();
        rejected(404, () -> service.confirm(other.token, new PaymentService.Confirm(order.orderId(), key, order.amount())));
        rejected(404, () -> service.reconcile(other.token, order.orderId()));
        rejected(400, () -> service.confirm(user.token, new PaymentService.Confirm(order.orderId(), key, 1)));
        rejected(400, () -> service.confirm(user.token, new PaymentService.Confirm(order.orderId(), "https://evil.test/key", order.amount())));
        updateCatalog(false, null); rejected(503, () -> create("dog-1"));
        assertEquals(0, gateway.gets.get()); assertEquals(0, gateway.confirmations.get()); assertEquals(0, tickets());
    }

    @Test void confirmationAndHistoryReconciliationGrantOnceAndKeepPaymentKeyUnique() {
        var order = create("dog-10"); String key = prepare(order);
        assertTrue(confirm(order, key).order().ticketsGranted());
        assertEquals("DONE", confirm(order, key).order().status());
        assertEquals("DONE", service.reconcile(user.token, order.orderId()).order().status());
        assertEquals(1, gateway.confirmations.get()); assertEquals(10, tickets());
        var other = create("dog-1"); rejected(409, () -> confirm(other, key));
        rejected(409, () -> confirm(order, "some_other_payment_key"));
        String json = mapper.writeValueAsString(service.history(user.token));
        assertFalse(json.contains(key)); assertFalse(json.contains("idempotencyKey")); assertFalse(json.contains(user.account.email));
    }

    @Test void concurrentApprovalsUseDatabaseClaimAndOneWalletCredit() throws Exception {
        var order = create("dog-10"); String key = prepare(order);
        gateway.entered = new CountDownLatch(1); gateway.release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Future<PaymentService.Result> first = pool.submit(() -> confirm(order, key));
            assertTrue(gateway.entered.await(10, TimeUnit.SECONDS));
            try { rejected(409, () -> confirm(order, key)); }
            finally { gateway.release.countDown(); }
            assertEquals("DONE", first.get(10, TimeUnit.SECONDS).order().status());
        }
        assertEquals(1, gateway.confirmations.get()); assertEquals(10, tickets());
    }

    @Test void timeoutAfterApprovalRecoversByQueryWithoutASecondCharge() {
        var order = create("dog-10"); String key = prepare(order); gateway.failAfterApproval = key;
        assertEquals("DONE", confirm(order, key).order().status()); assertEquals(10, tickets());
        assertEquals("DONE", service.reconcile(user.token, order.orderId()).order().status());
        assertEquals(1, gateway.confirmations.get()); assertEquals(10, tickets());
    }

    @Test void continuingProviderOutageRetainsUncertainOrderForLaterRecovery() {
        var order = create("dog-10"); String key = prepare(order); gateway.failAfterApproval = key; gateway.blockRecovery = true;
        var waiting = confirm(order, key); assertEquals("VERIFYING", waiting.order().status()); assertFalse(waiting.order().ticketsGranted()); assertEquals(0, tickets());
        gateway.failQuery = null;
        assertEquals("DONE", service.reconcile(user.token, order.orderId()).order().status());
        assertEquals(1, gateway.confirmations.get()); assertEquals(10, tickets());
    }

    @Test void nullablePreApprovalMethodDoesNotBlockApprovalButApprovedResponseMustBeTossPay() {
        var order = create("dog-1"); String key = prepare(order);
        gateway.payments.put(key, new TossGateway.Payment(key, order.orderId(), order.amount(), order.amount(), "KRW", null, null, "IN_PROGRESS", null, null, List.of()));
        assertEquals("DONE", confirm(order, key).order().status()); assertEquals(1, tickets());
    }

    @Test void zeroPreApprovalBalanceAllowsApprovalButDoneBalanceMustMatchOrderAmount() {
        var order = create("dog-1"); String key = prepare(order);
        gateway.payments.put(key, new TossGateway.Payment(key, order.orderId(), order.amount(), 0, "KRW", "간편결제", "토스페이", "IN_PROGRESS", null, null, List.of()));
        assertEquals("DONE", confirm(order, key).order().status()); assertEquals(1, gateway.confirmations.get()); assertEquals(1, tickets());

        var invalid = create("dog-1"); String invalidKey = prepare(invalid);
        gateway.payments.put(invalidKey, new TossGateway.Payment(invalidKey, invalid.orderId(), invalid.amount(), 0, "KRW", "간편결제", "토스페이", "DONE", System.currentTimeMillis(), null, List.of()));
        rejected(502, () -> confirm(invalid, invalidKey));
        assertFalse(orders.findById(invalid.orderId()).orElseThrow().ticketsGranted); assertEquals(1, tickets());
    }

    @Test void timeoutBeforeApprovalRetriesWithPersistedSameIdempotencyKey() {
        var order = create("dog-10"); String key = prepare(order); gateway.failBeforeApproval = key;
        assertEquals("VERIFYING", confirm(order, key).order().status());
        String persisted = orders.findById(order.orderId()).orElseThrow().idempotencyKey;
        assertEquals("DONE", service.reconcile(user.token, order.orderId()).order().status());
        assertEquals(List.of(persisted, persisted), gateway.ids); assertEquals(10, tickets());
    }

    @Test void databaseFailureAfterWalletWriteRollsBackBothAndReconciliationRecovers() {
        var order = create("dog-10"); String key = prepare(order);
        jdbc.execute("alter table payment_orders add constraint test_fail_payment_finalize check (id <> '" + order.orderId() + "' or status <> 'DONE')");
        try {
            assertEquals("VERIFYING", confirm(order, key).order().status());
            assertEquals(0, tickets());
            var pending = orders.findById(order.orderId()).orElseThrow(); assertEquals(key, pending.paymentKey); assertNotNull(pending.confirmationRequestedAt); assertFalse(pending.ticketsGranted);
        } finally { jdbc.execute("alter table payment_orders drop constraint test_fail_payment_finalize"); }
        assertEquals("DONE", service.reconcile(user.token, order.orderId()).order().status());
        assertEquals(10, tickets()); assertEquals(1, gateway.confirmations.get());
    }

    @Test void expiredCrashClaimIsRecoverableButFreshClaimCannotBeOverwritten() {
        var order = create("dog-1"); String key = prepare(order); gateway.failAfterApproval = key; confirm(order, key);
        PaymentOrder stored = orders.findById(order.orderId()).orElseThrow(); stored.claimToken = UUID.randomUUID().toString(); stored.claimUntil = System.currentTimeMillis() + 60_000; orders.save(stored);
        rejected(409, () -> service.reconcile(user.token, order.orderId()));
        stored.claimUntil = 1; orders.save(stored);
        assertEquals("DONE", service.reconcile(user.token, order.orderId()).order().status()); assertEquals(1, tickets());
    }

    @Test void staleIdempotencyWindowAllowsOnlyQueryAndDoesNotIssueNewApproval() {
        var order = create("dog-1"); String key = prepare(order); gateway.failBeforeApproval = key; confirm(order, key);
        PaymentOrder stored = orders.findById(order.orderId()).orElseThrow(); stored.confirmationRequestedAt = System.currentTimeMillis() - PaymentService.IDEMPOTENCY_MS - 1; orders.save(stored);
        assertEquals("VERIFYING", service.reconcile(user.token, order.orderId()).order().status());
        assertEquals(1, gateway.confirmations.get()); assertEquals(0, tickets());
    }

    @Test void providerAmountCurrencyOrderMethodAndIncompleteStatusesNeverGrant() {
        for (String variant : List.of("amount", "currency", "order", "provider", "status", "refund", "date")) {
            var order = create("dog-1"); String key = prepare(order);
            var correct = payment(key, order.orderId(), order.amount(), "DONE", 0);
            var bad = new TossGateway.Payment(key, variant.equals("order") ? "foreign_order" : order.orderId(),
                variant.equals("amount") ? 1 : order.amount(), order.amount(), variant.equals("currency") ? "USD" : "KRW",
                "간편결제", variant.equals("provider") ? "카카오페이" : "토스페이", variant.equals("status") ? "WAITING_FOR_DEPOSIT" : "DONE",
                variant.equals("date") ? null : correct.approvedAt(), null,
                variant.equals("refund") ? List.of(new TossGateway.Cancel(1, "DONE", "wrong")) : List.of());
            gateway.payments.put(key, bad); rejected(variant.equals("order") ? 409 : 502, () -> confirm(order, key));
        }
        assertEquals(0, tickets()); assertEquals(0, gateway.confirmations.get());
        var pending = create("dog-1"); String key = prepare(pending);
        gateway.payments.put(key, payment(key, pending.orderId(), pending.amount(), "EXPIRED", 0));
        assertEquals("EXPIRED", confirm(pending, key).order().status()); assertEquals(0, tickets());
    }

    @Test void verifiedForeignOrderCannotReserveAnotherOrdersKeyAndUnusedIntentIsDiscarded() {
        var real = create("dog-1"); String realKey = prepare(real); var wrong = create("dog-1");
        String unusedId = orders.findById(wrong.orderId()).orElseThrow().idempotencyKey;
        rejected(409, () -> confirm(wrong, realKey));
        var cleared = orders.findById(wrong.orderId()).orElseThrow();
        assertNull(cleared.paymentKey); assertNull(cleared.confirmationRequestedAt); assertNull(cleared.approvalSentAt); assertNull(cleared.claimToken);
        assertEquals("CREATED", cleared.status); assertNotEquals(unusedId, cleared.idempotencyKey); assertEquals(0, gateway.confirmations.get());
        assertEquals("DONE", confirm(real, realKey).order().status());
        String wrongsOwnKey = prepare(wrong); assertEquals("DONE", confirm(wrong, wrongsOwnKey).order().status()); assertEquals(2, tickets());
        assertFalse(gateway.ids.contains(unusedId));
    }

    @Test void uncertainApprovalNeverDiscardsItsPersistedIntentFromLaterInconsistentProviderData() {
        var order = create("dog-1"); String key = prepare(order); gateway.failBeforeApproval = key; confirm(order, key);
        var before = orders.findById(order.orderId()).orElseThrow(); assertNotNull(before.approvalSentAt);
        gateway.payments.put(key, payment(key, "foreign_order_id", order.amount(), "DONE", 0)); rejected(502, () -> service.reconcile(user.token, order.orderId()));
        var after = orders.findById(order.orderId()).orElseThrow(); assertEquals(key, after.paymentKey);
        assertEquals(before.idempotencyKey, after.idempotencyKey); assertEquals(before.confirmationRequestedAt, after.confirmationRequestedAt);
        gateway.payments.put(key, payment(key, order.orderId(), order.amount(), "DONE", 0));
        assertEquals("DONE", service.reconcile(user.token, order.orderId()).order().status()); assertEquals(1, tickets());
    }

    @Test void knownUnsupportedPreApprovalMethodIsRejectedEvenWhenEasyPayIsNull() {
        var order = create("dog-1"); String key = prepare(order);
        gateway.payments.put(key, new TossGateway.Payment(key, order.orderId(), order.amount(), order.amount(), "KRW", "가상계좌", null, "IN_PROGRESS", null, null, List.of()));
        rejected(502, () -> confirm(order, key)); assertEquals(0, gateway.confirmations.get()); assertEquals(0, tickets());
    }

    @Test void partialRefundRoundsUpDeduplicatesAndNeverRegrantsFromStaleResponse() {
        var order = create("dog-10"); String key = prepare(order); confirm(order, key);
        gateway.payments.put(key, payment(key, order.orderId(), order.amount(), "PARTIAL_CANCELED", 1));
        assertEquals(1, service.reconcile(user.token, order.orderId()).order().refundedAmount()); assertEquals(9, tickets());
        service.reconcile(user.token, order.orderId()); assertEquals(9, tickets());
        gateway.payments.put(key, payment(key, order.orderId(), order.amount(), "PARTIAL_CANCELED", order.amount() / 2));
        service.reconcile(user.token, order.orderId()); assertEquals(5, tickets());
        gateway.payments.put(key, payment(key, order.orderId(), order.amount(), "DONE", 0));
        assertEquals("PARTIAL_CANCELED", service.reconcile(user.token, order.orderId()).order().status()); assertEquals(5, tickets());
        gateway.payments.put(key, payment(key, order.orderId(), order.amount(), "CANCELED", order.amount()));
        service.reconcile(user.token, order.orderId()); service.reconcile(user.token, order.orderId()); assertEquals(0, tickets());
    }

    @Test void fullRefundAfterUseCanBeNegativeAndHoldsEveryDrawKind() {
        var order = create("dog-1"); String key = prepare(order); confirm(order, key);
        commerce.draw(user.token, Map.of("kind", "dog", "requestId", UUID.randomUUID().toString(), "catalogRevision", catalog.current().revision()));
        gateway.payments.put(key, payment(key, order.orderId(), order.amount(), "CANCELED", order.amount()));
        service.reconcile(user.token, order.orderId()); assertEquals(-1, tickets()); assertTrue(commerce.me(user.token).balanceHold());
        commerce.creditPaidTickets(user.account.id, "aura", 1, "test_aura_" + UUID.randomUUID());
        rejected(409, () -> commerce.draw(user.token, Map.of("kind", "aura", "requestId", UUID.randomUUID().toString(), "catalogRevision", catalog.current().revision())));
    }

    @Test void alreadyFullyCanceledPaymentNeverGrantsWhilePartialRecoveryGrantsOnlyNetTickets() {
        var full = create("dog-10"); String fullKey = prepare(full);
        gateway.payments.put(fullKey, payment(fullKey, full.orderId(), full.amount(), "CANCELED", full.amount()));
        assertFalse(confirm(full, fullKey).order().ticketsGranted()); assertEquals(0, tickets());
        gateway.payments.put(fullKey, payment(fullKey, full.orderId(), full.amount(), "DONE", 0));
        assertEquals("CANCELED", service.reconcile(user.token, full.orderId()).order().status()); assertEquals(0, tickets());
        var partial = create("dog-10"); String key = prepare(partial);
        gateway.payments.put(key, payment(key, partial.orderId(), partial.amount(), "PARTIAL_CANCELED", partial.amount() / 2));
        assertTrue(confirm(partial, key).order().ticketsGranted()); assertEquals(5, tickets());
    }

    @Test void unsignedWebhookOnlyQueriesBoundKeyNeverTrustsStatusOrApprovesAndRetriesTransportFailure() throws Exception {
        var order = create("dog-1"); String key = prepare(order);
        String body = mapper.writeValueAsString(Map.of("eventType", "PAYMENT_STATUS_CHANGED", "data", Map.of("orderId", order.orderId(), "paymentKey", key, "status", "DONE", "totalAmount", 1)));
        service.webhook(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)); assertEquals(0, gateway.gets.get());
        gateway.failQuery = key; assertEquals("VERIFYING", confirm(order, key).order().status());
        rejected(503, () -> service.webhook(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        gateway.failQuery = null;
        service.webhook(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)); assertEquals(0, tickets()); assertEquals(0, gateway.confirmations.get());
        gateway.payments.put(key, payment(key, order.orderId(), order.amount(), "DONE", 0));
        service.webhook(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)); service.webhook(body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertEquals(1, tickets()); assertEquals(0, gateway.confirmations.get());
        assertEquals(413, http("POST", "/webhook", null, " ".repeat(32_769)).statusCode());
        assertEquals(400, http("POST", "/webhook", null, "{").statusCode());
    }
}
