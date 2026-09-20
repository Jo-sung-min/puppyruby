package com.puppyruby.commerce;

import com.puppyruby.admin.AdminCommerceService;
import com.puppyruby.auth.*;
import com.puppyruby.game.*;
import com.puppyruby.walk.WalkService;
import com.puppyruby.desktop.DesktopService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:commerce-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop",
    "MAIL_ENABLED=false", "KAKAO_REST_API_KEY=", "ADMIN_EMAIL="
})
class CommerceServiceTest {
    @Autowired CommerceService commerce;
    @Autowired CommerceCatalogService catalogs;
    @Autowired AdminCommerceService admin;
    @Autowired CommerceSettingsRepository settings;
    @Autowired CommerceDrawRepository draws;
    @Autowired TicketLedgerRepository ledger;
    @Autowired CommerceWalletRepository wallets;
    @Autowired AuthService auth;
    @Autowired AccountRepository accounts;
    @Autowired GameService game;
    @Autowired AccessoryCatalog accessories;
    @Autowired WalkService walk;
    @Autowired DesktopService desktop;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    @LocalServerPort int port;
    record Identity(Account account, String token) {}
    Identity operator, customer;
    @BeforeEach void setup() {
        draws.deleteAll(); ledger.deleteAll(); wallets.deleteAll(); settings.deleteAll();
        jdbc.update("delete from admin_audit where target_type = 'COMMERCE'");
        operator = account(true); customer = account(false);
    }
    Identity account(boolean administrator) {
        var signed = auth.register(UUID.randomUUID().toString(), new AuthService.Register(UUID.randomUUID() + "@commerce.test", "Commerce-Test!2026", "상점 검증"));
        Account account = accounts.findById(signed.user().id()).orElseThrow();
        if (administrator) { account.role = Account.Role.ADMIN; account.emailVerified = true; accounts.save(account); }
        game.state(account.playerId);
        return new Identity(account, signed.token());
    }
    Map<String, Object> catalogInput(Map<String, String> forced) {
        var current = catalogs.current();
        List<Map<String, Object>> products = new ArrayList<>();
        current.products().forEach(product -> products.add(new LinkedHashMap<>(Map.of("id", product.id(), "price", product.price(), "enabled", product.enabled()))));
        List<Map<String, Object>> pools = new ArrayList<>();
        current.pools().forEach(pool -> {
            List<Map<String, Object>> entries = new ArrayList<>();
            pool.entries().forEach(entry -> entries.add(new LinkedHashMap<>(Map.of("id", entry.id(), "weight", forced.containsKey(pool.kind()) ? (forced.get(pool.kind()).equals(entry.id()) ? 1 : 0) : entry.weight()))));
            pools.add(new LinkedHashMap<>(Map.of("kind", pool.kind(), "entries", entries)));
        });
        return new LinkedHashMap<>(Map.of("expectedRevision", current.revision(), "salesEnabled", true, "products", products, "pools", pools));
    }
    long force(String kind, String entry) { return admin.save(operator.token, catalogInput(Map.of(kind, entry))).revision(); }
    void credit(Identity identity, String kind, int quantity) { commerce.creditPaidTickets(identity.account.id, kind, quantity, "test-order-" + UUID.randomUUID()); }
    Map<String, Object> drawInput(String kind, String request, long revision) { return Map.of("kind", kind, "requestId", request, "catalogRevision", revision); }
    CommerceService.DrawResult draw(Identity identity, String kind) { return commerce.draw(identity.token, drawInput(kind, UUID.randomUUID().toString(), catalogs.current().revision())); }
    long tickets(Identity identity, String kind) { return commerce.me(identity.token).tickets().get(kind); }
    void rejected(int status, Runnable operation) { assertEquals(status, assertThrows(ResponseStatusException.class, operation::run).getStatusCode().value()); }
    HttpResponse<String> http(String method, String path, String token, Object body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(10));
        request.header("X-Player-Id", operator.account.playerId);
        if (token != null) request.header("X-Session-Token", token);
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        if (body != null) request.header("Content-Type", "application/json");
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test void publicCatalogStartsClosedWithSixFixedProductsAndCompleteNormalizedPools() throws Exception {
        var catalog = catalogs.current(); assertEquals(0, catalog.revision()); assertNull(catalog.updatedAt()); assertFalse(catalog.salesEnabled());
        assertEquals(6, catalog.products().size()); assertEquals(3, catalog.pools().size());
        for (var product : catalog.products()) {
            assertEquals(product.kind() + "-" + product.quantity(), product.id());
            assertEquals(product.quantity() * (product.kind().equals("dog") ? 1500 : 1000), product.price()); assertTrue(product.enabled());
        }
        assertEquals(List.of(120, 8, 7), catalog.pools().stream().map(pool -> pool.entries().size()).toList());
        var accessoryPool = catalog.pools().stream().filter(pool -> pool.kind().equals("accessory")).findFirst().orElseThrow();
        assertEquals(accessories.paid().stream().map(item -> List.of(item.id(), item.label(), item.grade().name(), item.weight())).toList(),
            accessoryPool.entries().stream().map(entry -> List.of(entry.itemId(), entry.label(), entry.grade(), entry.weight())).toList());
        for (var pool : catalog.pools()) {
            BigDecimal probability = pool.entries().stream().map(entry -> new BigDecimal(entry.probability().replace("%", ""))).reduce(BigDecimal.ZERO, BigDecimal::add);
            assertTrue(probability.subtract(BigDecimal.valueOf(100)).abs().doubleValue() < 0.0001);
            assertTrue(pool.entries().stream().allMatch(entry -> entry.breed() != null && entry.breed() >= 6 ? entry.weight() == 0 : entry.weight() > 0));
        }
        assertEquals(200, http("GET", "/api/v1/commerce/catalog", null, null).statusCode());
        rejected(503, () -> commerce.productForPurchase("dog-1"));
        assertEquals(0, settings.count());
    }

    @Test void readingAnExistingPaidCatalogAddsOnlyZeroWeightBreedsAndPreservesEverySavedValue() {
        var legacy = new CommerceSettings(); legacy.revision = 41; legacy.updatedAt = 123456789L; legacy.salesEnabled = true;
        var savedWeights = new LinkedHashMap<String, Integer>();
        for (int breed = 0; breed < 6; breed++) for (Grade grade : Grade.values()) savedWeights.put("dog-" + breed + "-" + grade, 0);
        savedWeights.put("dog-0-N", 11); savedWeights.put("dog-5-SSR", 3);
        legacy.weightsJson = mapper.writeValueAsString(savedWeights);
        legacy.productsJson = mapper.writeValueAsString(Map.of("dog-1", Map.of("price", 2400, "enabled", false), "aura-10", Map.of("price", 8300, "enabled", true)));
        settings.saveAndFlush(legacy);
        var expanded = catalogs.current(); assertEquals(41, expanded.revision()); assertEquals(legacy.updatedAt, expanded.updatedAt()); assertTrue(expanded.salesEnabled());
        assertEquals(2400, expanded.products().getFirst().price()); assertFalse(expanded.products().getFirst().enabled());
        assertEquals(8300, expanded.products().stream().filter(product -> product.id().equals("aura-10")).findFirst().orElseThrow().price());
        var dogs = expanded.pools().getFirst().entries(); assertEquals(120, dogs.size());
        for (var entry : dogs) {
            if (entry.breed() < 6) assertEquals(savedWeights.get(entry.id()), entry.weight());
            else { assertEquals(0, entry.weight()); assertEquals("0%", entry.probability()); }
        }
        assertEquals("78.571429%", dogs.stream().filter(entry -> entry.id().equals("dog-0-N")).findFirst().orElseThrow().probability());
        assertEquals("21.428571%", dogs.stream().filter(entry -> entry.id().equals("dog-5-SSR")).findFirst().orElseThrow().probability());
        var unchanged = settings.findById(CommerceSettings.ID).orElseThrow();
        assertEquals(legacy.weightsJson, unchanged.weightsJson); assertEquals(legacy.productsJson, unchanged.productsJson); assertEquals(41, unchanged.revision);
        assertEquals(0L, jdbc.queryForObject("select count(*) from admin_audit where target_type='COMMERCE'", Long.class));
    }

    @Test void administratorsCanEnableNewBreedsAndRewardsKeepIndicesInGameWalkAndDesktop() {
        var original = game.state(customer.account.playerId).puppies().getFirst();
        credit(customer, "dog", 4);
        for (int breed : List.of(6, 10, 16, 29)) {
            force("dog", "dog-" + breed + "-SSR");
            var reward = draw(customer, "dog"); assertEquals(breed, reward.reward().breed()); assertEquals("SSR", reward.reward().grade());
            assertEquals(breed, reward.game().puppies().getLast().breed); assertEquals(1000, reward.game().coins());
            assertEquals(1500, catalogs.current().products().getFirst().price());
        }
        var grown = game.state(customer.account.playerId); assertEquals(5, grown.puppies().size()); assertEquals(original.id, grown.puppies().getFirst().id);
        assertEquals(original.name, grown.puppies().getFirst().name); assertEquals(0, grown.puppies().getFirst().breed); assertEquals(0, tickets(customer, "dog"));
        var connection = desktop.pair(new DesktopService.PairInput(desktop.pairCode(customer.account.playerId).code(), "새 견종 검증 PC"));
        assertEquals(29, connection.state().puppy().breed()); assertEquals(grown.selectedId(), connection.state().puppy().id());
        walk.act(customer.account.playerId, "profile", mapper.convertValue(Map.of("nickname", "차우차우 엄마"), WalkService.Action.class));
        var walking = walk.act(customer.account.playerId, "join", mapper.convertValue(Map.of("roomId", "official-meadow"), WalkService.Action.class));
        assertEquals(29, walking.state().room().members().stream().filter(member -> member.profile().id().equals(walking.state().me().id())).findFirst().orElseThrow().puppy().breed());
    }

    @Test void catalogUpdatesPricesAndActualProbabilityWithRevisionAndAudit() {
        var body = catalogInput(Map.of("dog", "dog-4-SSR"));
        ((Map<String, Object>) ((List<?>) body.get("products")).getFirst()).put("price", 2000);
        var result = admin.save(operator.token, body);
        assertEquals(1, result.revision()); assertNotNull(result.updatedAt()); assertTrue(result.salesEnabled());
        assertEquals(2000, commerce.productForPurchase("dog-1").price());
        var pool = result.pools().getFirst();
        assertEquals("100%", pool.entries().stream().filter(entry -> entry.id().equals("dog-4-SSR")).findFirst().orElseThrow().probability());
        assertTrue(pool.entries().stream().filter(entry -> !entry.id().equals("dog-4-SSR")).allMatch(entry -> entry.probability().equals("0%")));
        rejected(409, () -> admin.save(operator.token, body));
        assertEquals(1L, jdbc.queryForObject("select count(*) from admin_audit where target_type='COMMERCE'", Long.class));
        credit(customer, "dog", 1); var reward = draw(customer, "dog");
        assertEquals(4, reward.reward().breed()); assertEquals("SSR", reward.reward().grade()); assertEquals(2, reward.game().puppies().size());
        assertEquals(1000, reward.game().coins()); assertEquals(reward.reward().puppyId(), reward.game().selectedId());
        assertEquals("none", reward.game().puppies().getLast().aura);
        assertEquals(0, reward.wallet().tickets().get("dog"));
    }

    @Test void malformedCatalogAndUnauthorizedWritesNeverChangeSettings() throws Exception {
        for (Object body : List.of(Map.of(), Map.of("salesEnabled", true), Map.of("expectedRevision", 0, "salesEnabled", true, "products", List.of(), "pools", List.of())))
            assertEquals(400, http("POST", "/api/v1/admin/commerce/catalog", operator.token, body).statusCode());
        for (Object price : List.of(99, 1_000_001, 100.0, "1500", true)) {
            var body = catalogInput(Map.of()); ((Map<String, Object>) ((List<?>) body.get("products")).getFirst()).put("price", price);
            rejected(400, () -> admin.save(operator.token, body));
        }
        for (Object weight : List.of(-1, 1_000_001, 1.5, "1")) {
            var body = catalogInput(Map.of()); Map<?, ?> pool = (Map<?, ?>) ((List<?>) body.get("pools")).getFirst();
            ((Map<String, Object>) ((List<?>) pool.get("entries")).getFirst()).put("weight", weight);
            rejected(400, () -> admin.save(operator.token, body));
        }
        var zeros = catalogInput(Map.of("dog", "missing")); rejected(400, () -> admin.save(operator.token, zeros));
        var extra = catalogInput(Map.of()); extra.put("role", "ADMIN"); rejected(400, () -> admin.save(operator.token, extra));
        for (String token : Arrays.asList(null, customer.token)) {
            assertEquals(token == null ? 401 : 403, http("GET", "/api/v1/admin/commerce/catalog", token, null).statusCode());
            assertEquals(token == null ? 401 : 403, http("POST", "/api/v1/admin/commerce/catalog", token, catalogInput(Map.of())).statusCode());
        }
        operator.account.emailVerified = false; accounts.save(operator.account);
        rejected(403, () -> admin.save(operator.token, catalogInput(Map.of())));
        assertEquals(0, catalogs.current().revision()); assertFalse(catalogs.current().salesEnabled());
    }

    @Test void privateEndpointsRequireActiveAccountAndNeverAcceptGuestHeaderAsOwnership() throws Exception {
        for (String path : List.of("/me", "/draw", "/equip")) {
            String method = path.equals("/me") ? "GET" : "POST";
            assertEquals(401, http(method, "/api/v1/commerce" + path, null, path.equals("/me") ? null : Map.of()).statusCode());
        }
        customer.account.status = Account.Status.SUSPENDED; accounts.save(customer.account);
        rejected(403, () -> commerce.me(customer.token));
        rejected(403, () -> draw(customer, "dog"));
    }

    @Test void paidLedgerCreditsAndReversalsAreIdempotentAndHoldEveryDrawUntilRepaid() {
        String order = UUID.randomUUID().toString(), refund = UUID.randomUUID().toString();
        commerce.creditPaidTickets(customer.account.id, "dog", 1, order); commerce.creditPaidTickets(customer.account.id, "dog", 1, order);
        assertEquals(1, tickets(customer, "dog"));
        rejected(409, () -> commerce.creditPaidTickets(customer.account.id, "aura", 1, order));
        rejected(409, () -> commerce.creditPaidTickets(operator.account.id, "dog", 1, order));
        draw(customer, "dog");
        commerce.revokePaidTickets(customer.account.id, "dog", 1, refund); commerce.revokePaidTickets(customer.account.id, "dog", 1, refund);
        assertEquals(-1, tickets(customer, "dog")); assertTrue(commerce.me(customer.token).balanceHold());
        credit(customer, "aura", 1); rejected(409, () -> draw(customer, "aura")); assertEquals(1, tickets(customer, "aura"));
        credit(customer, "dog", 1); assertFalse(commerce.me(customer.token).balanceHold()); draw(customer, "aura");
        assertEquals(4, ledger.count());
    }

    @Test void duplicateDrawRequestsReturnOriginalRewardAndFreshStateWithoutAnotherCharge() {
        long revision = force("aura", "aura-snow"); credit(customer, "aura", 2);
        String request = UUID.randomUUID().toString(); var input = drawInput("aura", request, revision);
        var first = commerce.draw(customer.token, input); assertFalse(first.reward().duplicate());
        game.act(customer.account.playerId, "rename", new GameService.Action(first.game().selectedId(), "최신 이름", null, null, null));
        force("aura", "aura-peach");
        var replay = commerce.draw(customer.token, input);
        assertEquals(first.reward(), replay.reward()); assertEquals(1, tickets(customer, "aura"));
        assertEquals("최신 이름", replay.game().puppies().getFirst().name);
        rejected(409, () -> commerce.draw(customer.token, drawInput("dog", request, revision)));
        rejected(409, () -> commerce.draw(customer.token, drawInput("aura", request, revision + 1)));
        rejected(409, () -> commerce.draw(customer.token, drawInput("aura", UUID.randomUUID().toString(), revision)));
        assertEquals(1, draws.count());
    }

    @Test void concurrentTicketConsumptionAndSameRequestRetriesNeverDoubleSpend() throws Exception {
        credit(customer, "dog", 1); String first = UUID.randomUUID().toString(), second = UUID.randomUUID().toString();
        var results = concurrent(() -> commerce.draw(customer.token, drawInput("dog", first, 0)), () -> commerce.draw(customer.token, drawInput("dog", second, 0)));
        assertEquals(1, results.stream().filter(CommerceService.DrawResult.class::isInstance).count());
        assertEquals(0, tickets(customer, "dog")); assertEquals(2, game.state(customer.account.playerId).puppies().size());
        credit(customer, "aura", 1); String same = UUID.randomUUID().toString();
        var replay = concurrent(() -> commerce.draw(customer.token, drawInput("aura", same, 0)), () -> commerce.draw(customer.token, drawInput("aura", same, 0)));
        assertEquals(2, replay.stream().filter(CommerceService.DrawResult.class::isInstance).count());
        assertEquals(((CommerceService.DrawResult) replay.get(0)).reward().id(), ((CommerceService.DrawResult) replay.get(1)).reward().id());
        assertEquals(0, tickets(customer, "aura")); assertEquals(2, draws.count());
    }

    @Test void concurrentFirstCreditsAndCatalogEditsHaveOneEffectiveOperation() throws Exception {
        String order = UUID.randomUUID().toString();
        concurrent(() -> { commerce.creditPaidTickets(customer.account.id, "dog", 10, order); return true; },
            () -> { commerce.creditPaidTickets(customer.account.id, "dog", 10, order); return true; });
        assertEquals(10, tickets(customer, "dog")); assertEquals(1, ledger.count());
        var body = catalogInput(Map.of());
        var results = concurrent(() -> admin.save(operator.token, body), () -> admin.save(operator.token, body));
        assertEquals(1, results.stream().filter(CommerceCatalogService.Catalog.class::isInstance).count()); assertEquals(1, catalogs.current().revision());
    }

    @Test void ownedCosmeticsAccumulateDuplicatesEquipOnlyOwnPuppyAndPreserveOtherCustomization() {
        admin.save(operator.token, catalogInput(Map.of("aura", "aura-snow", "accessory", "accessory-bow-blue")));
        credit(customer, "aura", 1); credit(customer, "accessory", 2);
        var aura = draw(customer, "aura"); var accessory = draw(customer, "accessory"); var duplicate = draw(customer, "accessory");
        assertFalse(accessory.reward().duplicate()); assertTrue(duplicate.reward().duplicate());
        assertTrue(duplicate.wallet().items().stream().anyMatch(item -> item.itemId().equals("bow-blue") && item.count() == 2));
        String puppy = aura.game().selectedId(), foreign = game.state(operator.account.playerId).selectedId();
        rejected(400, () -> commerce.equip(customer.token, Map.of("puppyId", foreign, "kind", "aura", "itemId", "snow")));
        rejected(400, () -> commerce.equip(operator.token, Map.of("puppyId", foreign, "kind", "aura", "itemId", "snow")));
        rejected(400, () -> commerce.equip(customer.token, Map.of("puppyId", puppy, "kind", "accessory", "itemId", "angel-wings")));
        commerce.equip(customer.token, Map.of("puppyId", puppy, "kind", "aura", "itemId", "snow"));
        commerce.equip(customer.token, Map.of("puppyId", puppy, "kind", "accessory", "itemId", "bow-blue"));
        var changed = game.act(customer.account.playerId, "customize", new GameService.Action(puppy, null, "rose", "blue", "bow-blue"));
        assertEquals("snow", changed.state().puppies().getFirst().aura); assertEquals("rose", changed.state().puppies().getFirst().fur);
        for (Identity person : List.of(customer, operator)) {
            walk.act(person.account.playerId, "profile", mapper.convertValue(Map.of("nickname", "산책 장식 검증"), WalkService.Action.class));
            walk.act(person.account.playerId, "join", mapper.convertValue(Map.of("roomId", "official-meadow"), WalkService.Action.class));
        }
        var visible = walk.state(operator.account.playerId).room().members().stream().filter(member -> member.puppy().id().equals(puppy)).findFirst().orElseThrow();
        assertEquals("snow", visible.puppy().aura()); assertEquals("bow-blue", visible.puppy().accessory());
        var linked = desktop.pair(new DesktopService.PairInput(desktop.pairCode(customer.account.playerId).code(), "장식 검증 PC"));
        assertEquals("snow", linked.state().puppy().aura()); assertEquals("bow-blue", linked.state().puppy().accessory());
        rejected(400, () -> game.act(customer.account.playerId, "customize", new GameService.Action(puppy, null, "rose", "blue", "halo")));
        for (String free : List.of("none", "ribbon", "scarf", "crown")) game.act(customer.account.playerId, "customize", new GameService.Action(puppy, null, "rose", "blue", free));
        assertEquals("none", commerce.equip(customer.token, Map.of("puppyId", puppy, "kind", "aura", "itemId", "none")).state().puppies().getFirst().aura);
    }

    @Test void dogCapacityFailureDoesNotConsumeTicketOrRecordReward() {
        for (int index = 1; index < 100; index++) game.awardPuppy(customer.account.playerId, 0, Grade.N);
        credit(customer, "dog", 1); rejected(409, () -> draw(customer, "dog"));
        assertEquals(1, tickets(customer, "dog")); assertEquals(0, draws.count());
        assertEquals(100, game.state(customer.account.playerId).puppies().size());
    }

    @Test void historyIsBoundedButOldRequestsRemainIdempotentAndPrivateFieldsNeverEscape() throws Exception {
        long revision = force("aura", "aura-snow"); credit(customer, "aura", 55);
        var firstInput = drawInput("aura", UUID.randomUUID().toString(), revision);
        var first = commerce.draw(customer.token, firstInput);
        for (int index = 1; index < 55; index++) draw(customer, "aura");
        var result = commerce.draw(customer.token, firstInput);
        assertEquals(first.reward(), result.reward()); assertEquals(50, result.wallet().history().size());
        assertEquals(55, result.wallet().items().getFirst().count()); assertEquals(0, result.wallet().tickets().get("aura"));
        String json = mapper.writeValueAsString(result.wallet());
        for (String privateField : List.of("accountId", "requestKey", "tokenHash", "operationId", customer.account.playerId, customer.token)) assertFalse(json.contains(privateField));
        assertEquals(0, commerce.me(operator.token).history().size());
    }

    @Test void unknownFieldsInvalidKindsAndMissingTicketNeverGrantAReward() {
        var input = new LinkedHashMap<>(drawInput("dog", UUID.randomUUID().toString(), 0)); input.put("weight", 100);
        rejected(400, () -> commerce.draw(customer.token, input));
        rejected(400, () -> draw(customer, "dog"));
        rejected(400, () -> commerce.draw(customer.token, drawInput("DOG", UUID.randomUUID().toString(), 0)));
        rejected(400, () -> commerce.draw(customer.token, drawInput("dog", "invalid", 0)));
        assertEquals(1, game.state(customer.account.playerId).puppies().size()); assertEquals(0, draws.count());
    }

    private List<Object> concurrent(Callable<?> first, Callable<?> second) throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            CountDownLatch ready = new CountDownLatch(1); List<Future<Object>> results = new ArrayList<>();
            for (Callable<?> operation : List.of(first, second)) results.add(pool.submit(() -> { ready.await(); try { return operation.call(); } catch (ResponseStatusException rejected) { return rejected.getStatusCode().value(); } }));
            ready.countDown(); return List.of(results.get(0).get(20, TimeUnit.SECONDS), results.get(1).get(20, TimeUnit.SECONDS));
        }
    }
}
