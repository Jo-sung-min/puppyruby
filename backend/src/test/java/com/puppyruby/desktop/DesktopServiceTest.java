package com.puppyruby.desktop;

import com.puppyruby.game.GameService;
import com.puppyruby.game.PlayerRepository;
import com.puppyruby.walk.WalkService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:desktop-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop"
})
class DesktopServiceTest {
    @Autowired DesktopService desktop;
    @Autowired DesktopPairingRepository pairings;
    @Autowired DesktopDeviceRepository devices;
    @Autowired DesktopReceiptRepository receipts;
    @Autowired GameService game;
    @Autowired PlayerRepository players;
    @Autowired WalkService walk;
    @Autowired ObjectMapper mapper;

    String owner() { return UUID.randomUUID().toString(); }
    DesktopService.PairResult connect(String player) {
        return desktop.pair(new DesktopService.PairInput(desktop.pairCode(player).code(), "나의 컴퓨터"));
    }
    DesktopService.Action action(DesktopService.PairResult connection, String action) {
        return new DesktopService.Action(action, connection.state().puppy().id(), null, UUID.randomUUID().toString());
    }
    void status(int expected, org.junit.jupiter.api.function.Executable call) {
        assertEquals(expected, assertThrows(ResponseStatusException.class, call).getStatusCode().value());
    }

    @Test void pairingExposesOnlyNarrowCurrentPuppyAndPersistsOnlyHashedSecrets() throws Exception {
        String player = owner();
        var social = walk.act(player, "profile", new WalkService.Action("산책닉네임", 31, "절대로노출되지않을이름", null,
            null, null, null, null, null, null, null, null, null, null));
        var code = desktop.pairCode(player);
        assertTrue(code.code().matches("[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}"));
        assertTrue(code.expiresAt() > System.currentTimeMillis());
        var connection = desktop.pair(new DesktopService.PairInput(code.code().toLowerCase(Locale.ROOT), "작업용 PC"));
        assertEquals(32, Base64.getUrlDecoder().decode(connection.token()).length);
        assertEquals("작업용 PC", connection.device().label());
        assertEquals(game.state(player).selectedId(), connection.state().puppy().id());
        assertEquals(65, connection.state().obedience());
        var persisted = devices.findById(connection.device().id()).orElseThrow();
        assertNotEquals(connection.token(), persisted.tokenHash); assertEquals(64, persisted.tokenHash.length());
        var pairing = pairings.findByPlayerId(player).getFirst();
        assertNotEquals(code.code().replace("-", ""), pairing.codeHash); assertNotNull(pairing.consumedAt);
        String json = mapper.writeValueAsString(connection);
        assertFalse(json.contains(player)); assertFalse(json.contains(social.state().me().id()));
        assertFalse(json.contains("절대로노출되지않을이름")); assertFalse(json.contains("산책닉네임"));
        var response = mapper.valueToTree(connection.state());
        assertEquals(Set.of("puppy", "coins", "promotionXp", "obedience", "syncedAt"), response.propertyStream().map(Map.Entry::getKey).collect(java.util.stream.Collectors.toSet()));
        String links = mapper.writeValueAsString(desktop.links(player));
        assertFalse(links.contains(connection.token())); assertFalse(links.contains(persisted.tokenHash)); assertFalse(links.contains(player));
        status(400, () -> game.state(connection.token())); status(400, () -> walk.state(connection.token()));
        status(401, () -> desktop.state(player)); status(401, () -> desktop.state(null));
    }

    @Test void codeIsSingleUseExpiresAndRegenerationInvalidatesPreviousCode() {
        String player = owner();
        var old = desktop.pairCode(player); var replacement = desktop.pairCode(player);
        status(400, () -> desktop.pair(new DesktopService.PairInput(old.code(), "PC")));
        desktop.pair(new DesktopService.PairInput(replacement.code(), "PC"));
        status(400, () -> desktop.pair(new DesktopService.PairInput(replacement.code(), "PC")));
        var expiring = desktop.pairCode(player);
        var pairing = pairings.findByPlayerId(player).getFirst(); pairing.expiresAt = System.currentTimeMillis() - 1; pairings.save(pairing);
        status(400, () -> desktop.pair(new DesktopService.PairInput(expiring.code(), "PC")));
    }

    @Test void exactlyOneConcurrentCallerCanRedeemCode() throws Exception {
        String player = owner(); var code = desktop.pairCode(player);
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            var barrier = new CountDownLatch(1);
            Callable<Boolean> pair = () -> {
                barrier.await();
                try { desktop.pair(new DesktopService.PairInput(code.code(), "동시 연결")); return true; }
                catch (ResponseStatusException error) { return false; }
            };
            var first = pool.submit(pair); var second = pool.submit(pair); barrier.countDown();
            assertNotEquals(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
        }
        assertEquals(1, desktop.links(player).devices().size());
    }

    @Test void tokenRevocationIsImmediateAndAnotherOwnerCannotRevokeOrUseItsDevice() {
        String first = owner(), second = owner(); var a = connect(first); var b = connect(second);
        assertEquals(1, desktop.links(first).devices().size()); assertEquals(1, desktop.links(second).devices().size());
        status(404, () -> desktop.revoke(second, new DesktopService.RevokeInput(a.device().id())));
        status(409, () -> desktop.act(b.token(), new DesktopService.Action("feed", a.state().puppy().id(), null, UUID.randomUUID().toString())));
        var changed = desktop.act(a.token(), action(a, "feed")); assertEquals(1010, changed.state().coins());
        assertEquals(1000, desktop.state(b.token()).coins());
        assertTrue(desktop.revoke(first, new DesktopService.RevokeInput(a.device().id())).devices().isEmpty());
        status(401, () -> desktop.state(a.token())); status(401, () -> desktop.act(a.token(), action(a, "rest")));
        assertNotNull(desktop.state(b.token()));
        assertTrue(desktop.revoke(first, new DesktopService.RevokeInput(a.device().id())).devices().isEmpty());
    }

    @Test void idempotentActionCannotRewardTwiceAndReplaysReturnFreshState() {
        String player = owner(); var connection = connect(player); var feed = action(connection, "feed");
        var first = desktop.act(connection.token(), feed);
        assertEquals(10, first.state().puppy().xp()); assertEquals(1010, first.state().coins());
        game.act(player, "rest", new GameService.Action(first.state().puppy().id(), null, null, null, null));
        var entity = players.findById(player).orElseThrow(); entity.puppies.getFirst().lastFeed = 0; players.save(entity);
        var replay = desktop.act(connection.token(), feed);
        assertEquals(15, replay.state().puppy().xp()); assertEquals(1015, replay.state().coins());
        assertEquals(first.message(), replay.message()); assertEquals(first.success(), replay.success());
        assertEquals(2, game.state(player).careCount());
        status(409, () -> desktop.act(connection.token(), new DesktopService.Action("play", feed.puppyId(), null, feed.requestId())));
        status(409, () -> desktop.act(connection.token(), new DesktopService.Action("feed", feed.puppyId(), "changed", feed.requestId())));
        assertEquals(1015, desktop.state(connection.token()).coins());
    }

    @Test void concurrentDuplicateActionHasExactlyOneRewardAndOneReceipt() throws Exception {
        String player = owner(); var connection = connect(player); var feed = action(connection, "feed");
        long before = receipts.count();
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            var barrier = new CountDownLatch(1);
            Callable<DesktopService.Result> request = () -> { barrier.await(); return desktop.act(connection.token(), feed); };
            var a = pool.submit(request); var b = pool.submit(request); barrier.countDown();
            assertEquals(a.get(10, TimeUnit.SECONDS).message(), b.get(10, TimeUnit.SECONDS).message());
        }
        assertEquals(before + 1, receipts.count()); assertEquals(10, desktop.state(connection.token()).puppy().xp());
        assertEquals(1, game.state(player).careCount());
    }

    @Test void webSelectionAndAppearanceAreAuthoritativeAndOldDogActionsRequireRefresh() {
        String player = owner(); var connection = connect(player); var staleAction = action(connection, "feed");
        var adopted = game.awardPuppy(player, 1, com.puppyruby.game.Grade.R);
        game.act(player, "rename", new GameService.Action(adopted.newPuppyId(), "동기화강아지", null, null, null));
        game.act(player, "customize", new GameService.Action(adopted.newPuppyId(), null, "rose", "blue", "ribbon"));
        status(409, () -> desktop.act(connection.token(), staleAction));
        var state = desktop.state(connection.token());
        assertEquals(adopted.newPuppyId(), state.puppy().id()); assertEquals("동기화강아지", state.puppy().name());
        assertEquals("rose", state.puppy().fur()); assertEquals("blue", state.puppy().eyes()); assertEquals("ribbon", state.puppy().accessory());
        assertEquals(0, state.puppy().xp()); assertEquals(1000, state.coins());
        for (String action : List.of("adopt", "gift", "select", "customize", "rename", "profile", "friend-request"))
            status(400, () -> desktop.act(connection.token(), new DesktopService.Action(action, state.puppy().id(), null, UUID.randomUUID().toString())));
    }

    @Test void desktopTrainingAndQuestionsUseServerGradeRulesAndNoArbitraryExperience() {
        String player = owner(); var connection = connect(player); String dogId = connection.state().puppy().id();
        status(400, () -> desktop.act(connection.token(), new DesktopService.Action("train", dogId, "빵", UUID.randomUUID().toString())));
        var ask = desktop.act(connection.token(), new DesktopService.Action("ask", dogId, "엑셀 붙여넣기", UUID.randomUUID().toString()));
        assertTrue(ask.success()); assertTrue(ask.message().contains("Ctrl + V다 멍!")); assertEquals(0, ask.state().puppy().xp());
        var trained = desktop.act(connection.token(), new DesktopService.Action("train", dogId, "puppy-sit", UUID.randomUUID().toString()));
        assertEquals(trained.success() ? 20 : 5, trained.state().puppy().xp());
        status(400, () -> desktop.act(connection.token(), new DesktopService.Action("promote", dogId, null, UUID.randomUUID().toString())));
        var entity = players.findById(player).orElseThrow(); entity.puppies.getFirst().xp = 100; players.save(entity);
        var promoted = desktop.act(connection.token(), new DesktopService.Action("promote", dogId, null, UUID.randomUUID().toString()));
        assertEquals("SR", promoted.state().puppy().grade()); assertEquals(0, promoted.state().puppy().xp());
        status(400, () -> desktop.act(connection.token(), new DesktopService.Action("feed", dogId, null, "not-a-uuid")));
        status(400, () -> desktop.act(connection.token(), new DesktopService.Action("ask", dogId, "가".repeat(501), UUID.randomUUID().toString())));
    }

    @Test void deviceLimitAndBadPairingRateLimitAreEnforcedAcrossRollbacks() {
        String player = owner();
        for (int index = 0; index < DesktopService.MAX_DEVICES; index++) connect(player);
        status(409, () -> desktop.pairCode(player));
        desktop.revoke(player, new DesktopService.RevokeInput(desktop.links(player).devices().getFirst().id()));
        assertNotNull(desktop.pairCode(player));
        for (int index = 0; index < PairingRateLimiter.MAX_FAILURES; index++)
            status(400, () -> desktop.pair(new DesktopService.PairInput("invalid", "PC")));
        status(429, () -> desktop.pair(new DesktopService.PairInput("invalid", "PC")));
        assertNotNull(connect(owner()), "Malformed attempts must not block valid codes through the same proxy");
        var limiter = new PairingRateLimiter();
        for (int index = 0; index < PairingRateLimiter.MAX_FAILURES; index++) limiter.failed("caller", 10);
        status(429, () -> limiter.check("caller", 11));
        assertDoesNotThrow(() -> limiter.check("caller", 10 + PairingRateLimiter.WINDOW_MS));
    }

    @Test void invalidAttemptsBlockOnlyTheirCodePrefixUnderOneProxy() {
        String player = owner(), other = owner();
        var target = desktop.pairCode(player);
        var unaffected = desktop.pairCode(other);
        while (unaffected.code().substring(0, 4).equals(target.code().substring(0, 4))) unaffected = desktop.pairCode(other);
        String normalized = target.code().replace("-", "");
        String wrong = normalized.substring(0, 11) + (normalized.charAt(11) == '0' ? '1' : '0');
        for (int index = 0; index < PairingRateLimiter.MAX_FAILURES; index++)
            status(400, () -> desktop.pair(new DesktopService.PairInput(wrong, "PC")));
        status(429, () -> desktop.pair(new DesktopService.PairInput(target.code(), "PC")));
        assertNotNull(desktop.pair(new DesktopService.PairInput(unaffected.code(), "다른 PC")));
    }

    @Test void globalBackstopIsGenerousBoundedAndExpires() {
        var limiter = new PairingRateLimiter();
        for (int index = 0; index < PairingRateLimiter.MAX_GLOBAL_FAILURES; index++) {
            limiter.check("prefix-" + index, 10); limiter.failed("prefix-" + index, 10);
        }
        status(429, () -> limiter.check("unseen-prefix", 11));
        assertDoesNotThrow(() -> limiter.check("unseen-prefix", 10 + PairingRateLimiter.WINDOW_MS));
    }
}
