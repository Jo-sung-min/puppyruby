package com.puppyruby.commerce;

import com.puppyruby.auth.*;
import com.puppyruby.game.*;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;

@Service
public class CommerceService {
    private final CommerceStore store;
    private final CommerceCatalogService catalogs;
    private final CommerceWalletRepository wallets;
    private final CommerceDrawRepository draws;
    private final TicketLedgerRepository ledger;
    private final AccountRepository accounts;
    private final AuthService auth;
    private final GameService game;
    private final AccessoryCatalog accessories;
    private final SecureRandom random = new SecureRandom();
    CommerceService(CommerceStore store, CommerceCatalogService catalogs, CommerceWalletRepository wallets,
                    CommerceDrawRepository draws, TicketLedgerRepository ledger, AccountRepository accounts, AuthService auth, GameService game,
                    AccessoryCatalog accessories) {
        this.store = store; this.catalogs = catalogs; this.wallets = wallets; this.draws = draws; this.ledger = ledger;
        this.accounts = accounts; this.auth = auth; this.game = game; this.accessories = accessories;
    }
    public record PurchaseProduct(String id, String kind, String name, int quantity, int price, long catalogRevision) {}
    public record Item(String kind, String itemId, long count) {}
    public record Reward(String id, String kind, String entryId, String label, String grade, Integer breed, String itemId,
                         String puppyId, long createdAt, long catalogRevision, boolean duplicate) {}
    public record Wallet(Map<String, Long> tickets, List<Item> items, List<Reward> history, boolean balanceHold) {}
    public record DrawResult(Wallet wallet, Reward reward, GameService.State game) {}

    @Transactional(readOnly = true)
    public PurchaseProduct productForPurchase(String productId) {
        var catalog = catalogs.current();
        if (!catalog.salesEnabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "뽑기권 판매를 준비하고 있어요. 잠시 후 다시 확인해 주세요.");
        var product = catalog.products().stream().filter(value -> value.id().equals(productId)).findFirst().orElseThrow(() -> CommerceInput.bad("상품을 찾을 수 없어요."));
        if (!product.enabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "현재 판매하지 않는 상품이에요.");
        return new PurchaseProduct(product.id(), product.kind(), product.name(), product.quantity(), product.price(), catalog.revision());
    }

    @Transactional
    public Wallet me(String token) { Account account = auth.requireAccount(token); store.lock(); return view(wallet(account.id)); }

    @Transactional
    public DrawResult draw(String token, Map<String, Object> body) {
        Account account = auth.requireAccount(token);
        Map<?, ?> input = CommerceInput.fields(body, "kind", "requestId", "catalogRevision");
        String kind = CommerceInput.kind(input.get("kind")), requestId = CommerceInput.uuid(input.get("requestId"));
        long revision = CommerceInput.integer(input.get("catalogRevision"), 0, CommerceInput.MAX_SAFE);
        var settings = store.lock(); CommerceWallet wallet = wallet(account.id);
        String requestKey = account.id + ":" + requestId;
        var previous = draws.findByRequestKey(requestKey).orElse(null);
        if (previous != null) {
            if (!previous.kind.equals(kind) || previous.catalogRevision != revision) throw CommerceInput.conflict("같은 요청 번호에 다른 뽑기 내용이 들어 있어요. 뽑기권은 사용되지 않았어요.");
            return new DrawResult(view(wallet), reward(previous), game.state(account.playerId));
        }
        if (settings.revision != revision) throw CommerceInput.conflict("뽑기 확률이 변경되었어요. 최신 확률을 확인한 뒤 다시 뽑아 주세요. 뽑기권은 사용되지 않았어요.");
        if (hold(wallet)) throw CommerceInput.conflict("결제 취소로 회수할 뽑기권이 남아 있어요. 잔액이 정리된 뒤 이용할 수 있어요.");
        if (balance(wallet, kind) < 1) throw CommerceInput.bad("이 종류의 뽑기권이 없어요. 상점에서 뽑기권을 확인해 주세요.");
        var pool = catalogs.view(settings).pools().stream().filter(value -> value.kind().equals(kind)).findFirst().orElseThrow();
        var entry = choose(pool.entries());
        CommerceDraw result = new CommerceDraw(); result.id = UUID.randomUUID().toString(); result.accountId = account.id;
        result.requestKey = requestKey; result.kind = kind; result.entryId = entry.id(); result.label = entry.label();
        result.grade = entry.grade(); result.breed = entry.breed(); result.itemId = entry.itemId();
        result.createdAt = System.currentTimeMillis(); result.catalogRevision = revision;
        GameService.State state;
        if (kind.equals("dog")) {
            var adopted = game.awardPuppy(account.playerId, entry.breed(), Grade.valueOf(entry.grade()));
            result.puppyId = adopted.newPuppyId(); state = adopted.state();
        } else {
            String key = itemKey(kind, entry.itemId()); long count = wallet.items.getOrDefault(key, 0L);
            result.duplicate = count > 0; wallet.items.put(key, add(count, 1)); state = game.state(account.playerId);
        }
        setBalance(wallet, kind, balance(wallet, kind) - 1);
        draws.saveAndFlush(result); wallets.flush();
        return new DrawResult(view(wallet), reward(result), state);
    }

    @Transactional
    public GameService.Result equip(String token, Map<String, Object> body) {
        Account account = auth.requireAccount(token);
        Map<?, ?> input = CommerceInput.fields(body, "puppyId", "kind", "itemId");
        String puppyId = CommerceInput.uuid(input.get("puppyId")), kind = CommerceInput.kind(input.get("kind")), item = CommerceInput.text(input.get("itemId"));
        if (kind.equals("dog") || !(item.equals("none") || (kind.equals("aura") ? CommerceDefinitions.AURAS.contains(item) : accessories.isPaid(item))))
            throw CommerceInput.bad("꾸미기 아이템을 확인해 주세요.");
        store.lock(); CommerceWallet wallet = wallet(account.id);
        if (!item.equals("none") && wallet.items.getOrDefault(itemKey(kind, item), 0L) < 1) throw CommerceInput.bad("내가 보유한 장식만 착용할 수 있어요.");
        return game.equipOwnedCosmetic(account.playerId, puppyId, kind, item);
    }

    /** Called only after payment confirmation; joins the caller's payment transaction. */
    @Transactional
    public void creditPaidTickets(String accountId, String kind, int quantity, String orderId) { adjust(accountId, kind, quantity, orderId, "CREDIT"); }

    /** A reversal may make a balance negative; all draws remain held until every balance is nonnegative. */
    @Transactional
    public void revokePaidTickets(String accountId, String kind, int quantity, String operationId) { adjust(accountId, kind, quantity, operationId, "REVOKE"); }

    private void adjust(String accountId, String kind, int quantity, String operationId, String action) {
        CommerceInput.kind(kind);
        if (quantity < 1 || quantity > 1_000_000 || operationId == null || operationId.isBlank() || operationId.length() > 200 || operationId.codePoints().anyMatch(Character::isISOControl))
            throw CommerceInput.bad("결제 처리 정보를 확인해 주세요.");
        if (accountId == null || !accounts.existsById(accountId)) throw CommerceInput.bad("결제 회원을 찾을 수 없어요.");
        store.lock();
        String id = hash(operationId); TicketLedger existing = ledger.findById(id).orElse(null);
        if (existing != null) {
            if (!existing.operationId.equals(operationId) || !existing.accountId.equals(accountId) || !existing.kind.equals(kind) || existing.quantity != quantity || !existing.action.equals(action))
                throw CommerceInput.conflict("이미 처리한 결제 번호의 내용이 일치하지 않아요.");
            return;
        }
        CommerceWallet wallet = wallet(accountId); setBalance(wallet, kind, add(balance(wallet, kind), action.equals("CREDIT") ? quantity : -quantity));
        TicketLedger entry = new TicketLedger(); entry.id = id; entry.operationId = operationId; entry.accountId = accountId;
        entry.kind = kind; entry.quantity = quantity; entry.action = action; entry.createdAt = System.currentTimeMillis();
        ledger.saveAndFlush(entry); wallets.flush();
    }
    private CommerceWallet wallet(String accountId) { return wallets.findById(accountId).orElseGet(() -> wallets.save(new CommerceWallet(accountId))); }
    private Wallet view(CommerceWallet wallet) {
        var items = wallet.items.entrySet().stream().filter(entry -> entry.getValue() > 0).sorted(Map.Entry.comparingByKey())
            .map(entry -> { String[] parts = entry.getKey().split(":", 2); return new Item(parts[0], parts[1], entry.getValue()); }).toList();
        return new Wallet(Map.of("dog", wallet.dog, "aura", wallet.aura, "accessory", wallet.accessory), items,
            draws.findTop50ByAccountIdOrderByCreatedAtDescIdDesc(wallet.accountId).stream().map(CommerceService::reward).toList(), hold(wallet));
    }
    private static Reward reward(CommerceDraw row) { return new Reward(row.id, row.kind, row.entryId, row.label, row.grade, row.breed, row.itemId, row.puppyId, row.createdAt, row.catalogRevision, row.duplicate); }
    private CommerceCatalogService.Entry choose(List<CommerceCatalogService.Entry> entries) {
        long total = entries.stream().mapToLong(CommerceCatalogService.Entry::weight).sum(); long roll = random.nextLong(total);
        for (var entry : entries) { if (roll < entry.weight()) return entry; roll -= entry.weight(); }
        throw new IllegalStateException("Invalid draw weights");
    }
    private static String itemKey(String kind, String itemId) { return kind + ":" + itemId; }
    private static boolean hold(CommerceWallet wallet) { return wallet.dog < 0 || wallet.aura < 0 || wallet.accessory < 0; }
    private static long balance(CommerceWallet wallet, String kind) { return switch (kind) { case "dog" -> wallet.dog; case "aura" -> wallet.aura; case "accessory" -> wallet.accessory; default -> throw CommerceInput.bad("뽑기권 종류를 확인해 주세요."); }; }
    private static void setBalance(CommerceWallet wallet, String kind, long value) { switch (kind) { case "dog" -> wallet.dog = value; case "aura" -> wallet.aura = value; case "accessory" -> wallet.accessory = value; default -> throw CommerceInput.bad("뽑기권 종류를 확인해 주세요."); } }
    private static long add(long value, long amount) {
        long result = Math.addExact(value, amount);
        if (result < -CommerceInput.MAX_SAFE || result > CommerceInput.MAX_SAFE) throw CommerceInput.conflict("보유 수량의 한도에 도달했어요.");
        return result;
    }
    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
