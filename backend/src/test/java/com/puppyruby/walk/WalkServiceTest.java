package com.puppyruby.walk;

import com.puppyruby.game.GameService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:walk-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop"
})
class WalkServiceTest {
    static final String PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=";
    @Autowired WalkService walk;
    @Autowired SocialProfileRepository profiles;
    @Autowired SocialMessageRepository messages;
    @Autowired SocialRoomRepository rooms;
    @Autowired ObjectMapper mapper;
    @Autowired GameService game;

    WalkService.Action input(Map<String, Object> fields) { return mapper.convertValue(fields, WalkService.Action.class); }
    WalkService.Action empty() { return input(Map.of()); }
    String visitor() { return UUID.randomUUID().toString(); }
    String person(String nickname) {
        String id = visitor();
        walk.act(id, "profile", input(Map.of("nickname", nickname, "age", 30, "realName", nickname + "실명", "photo", PHOTO)));
        return id;
    }
    String room(String owner, int capacity) {
        return walk.act(owner, "create", input(Map.of("title", "함께 산책", "description", "반가워요", "theme", "meadow", "capacity", capacity))).state().room().id();
    }
    void join(String playerId, String roomId) { walk.act(playerId, "join", input(Map.of("roomId", roomId))); }
    void friend(String actor, String action, String target) { walk.act(actor, action, input(Map.of("targetId", walk.state(target).me().id()))); }
    WalkService.Profile member(WalkService.State state, String profileId) {
        return state.room().members().stream().map(WalkService.Member::profile).filter(p -> p.id().equals(profileId)).findFirst().orElseThrow();
    }
    void hidden(WalkService.Profile profile) { assertNull(profile.realName()); assertNull(profile.photo()); }
    void exposed(WalkService.Profile profile, String realName) { assertEquals(realName, profile.realName()); assertEquals(PHOTO, profile.photo()); }

    @Test void firstVisitUsesSeparatePublicIdAndExplicitProfileSetup() throws Exception {
        String privateId = visitor();
        var state = walk.state(privateId);
        assertNotEquals(privateId, state.me().id()); UUID.fromString(state.me().id());
        assertEquals("루비엄마", state.me().nickname()); assertFalse(state.me().configured());
        assertNull(state.me().age()); assertNull(state.room());
        assertFalse(mapper.writeValueAsString(state).contains(privateId));
        for (String id : List.of("official-meadow", "official-sunset", "official-night")) {
            var official = state.rooms().stream().filter(r -> r.id().equals(id)).findFirst().orElseThrow();
            assertNull(official.owner()); assertEquals(0, official.memberCount());
        }
        assertThrows(ResponseStatusException.class, () -> join(privateId, "official-meadow"));
        assertEquals(state.me().id(), walk.state(privateId).me().id());
        var configured = walk.act(privateId, "profile", input(Map.of("nickname", "새친구"))).state();
        assertTrue(configured.me().configured()); assertNull(configured.me().age());
        join(privateId, "official-meadow"); assertNotNull(walk.state(privateId).room());
        walk.act(privateId, "leave", empty());
    }

    @Test void multipleClientsSeeLiveMembershipDogPositionAndDeduplicatedChat() throws Exception {
        String first = person("산책이"), second = person("별님"); String roomId = room(first, 4); join(second, roomId);
        String firstPublic = walk.state(first).me().id(), secondPublic = walk.state(second).me().id();
        var moved = walk.act(first, "move", input(Map.of("x", 76, "y", 63))).state();
        assertEquals(2, moved.room().memberCount());
        var otherView = walk.state(second);
        var remote = otherView.room().members().stream().filter(m -> m.profile().id().equals(firstPublic)).findFirst().orElseThrow();
        assertEquals(76, remote.x()); assertEquals(63, remote.y());
        assertEquals(game.state(first).selectedId(), remote.puppy().id()); hidden(remote.profile());
        String clientId = UUID.randomUUID().toString();
        var send = input(Map.of("text", "안녕! 같이 걷자", "clientId", clientId));
        walk.act(first, "message", send); walk.act(first, "message", send);
        var history = walk.state(second).room().messages();
        assertEquals(1, history.size()); assertEquals("안녕! 같이 걷자", history.getFirst().text());
        assertEquals(firstPublic, history.getFirst().author().id()); hidden(history.getFirst().author());
        assertThrows(ResponseStatusException.class, () -> walk.act(first, "message", input(Map.of("text", "같은 ID 다른 내용", "clientId", clientId))));
        String json = mapper.writeValueAsString(walk.state(second));
        assertFalse(json.contains(first)); assertFalse(json.contains(second));
        assertNotEquals(firstPublic, secondPublic);
        walk.act(first, "leave", empty());
        assertEquals(1, walk.state(second).room().memberCount());
        assertThrows(ResponseStatusException.class, () -> walk.act(first, "message", input(Map.of("text", "밖에서 쓰기", "clientId", UUID.randomUUID().toString()))));
        assertThrows(ResponseStatusException.class, () -> walk.act(first, "move", input(Map.of("x", 50, "y", 50))));
    }

    @Test void friendshipAcceptanceAndRemovalReprojectEveryPrivateFieldIncludingOldChat() throws Exception {
        String owner = person("햇살"), guest = person("달빛"), outsider = person("구름");
        String roomId = room(owner, 4); join(guest, roomId); join(outsider, roomId);
        String ownerId = walk.state(owner).me().id(), guestId = walk.state(guest).me().id();
        walk.act(owner, "message", input(Map.of("text", "예전 인사", "clientId", UUID.randomUUID().toString())));
        var before = walk.state(guest);
        hidden(before.room().owner()); hidden(member(before, ownerId)); hidden(before.room().messages().getFirst().author());
        friend(owner, "friend-request", guest);
        var incoming = walk.state(guest);
        assertEquals(1, incoming.requests().size()); assertEquals("incoming", incoming.requests().getFirst().friendship());
        hidden(incoming.requests().getFirst()); hidden(incoming.room().owner());
        assertThrows(ResponseStatusException.class, () -> friend(owner, "friend-accept", guest));
        assertThrows(ResponseStatusException.class, () -> friend(outsider, "friend-accept", owner));
        friend(guest, "friend-accept", owner);
        var accepted = walk.state(guest);
        exposed(accepted.room().owner(), "햇살실명"); exposed(member(accepted, ownerId), "햇살실명");
        exposed(accepted.room().messages().getFirst().author(), "햇살실명");
        exposed(accepted.friends().getFirst(), "햇살실명");
        exposed(accepted.rooms().stream().filter(r -> r.id().equals(roomId)).findFirst().orElseThrow().owner(), "햇살실명");
        exposed(member(walk.state(owner), guestId), "달빛실명");
        var stranger = walk.state(outsider); hidden(stranger.room().owner()); hidden(member(stranger, ownerId));
        hidden(stranger.room().messages().getFirst().author()); assertTrue(stranger.friends().isEmpty());
        friend(owner, "friend-remove", guest);
        var revoked = walk.state(guest);
        hidden(revoked.room().owner()); hidden(member(revoked, ownerId)); hidden(revoked.room().messages().getFirst().author());
        hidden(revoked.rooms().stream().filter(r -> r.id().equals(roomId)).findFirst().orElseThrow().owner());
        assertTrue(revoked.friends().isEmpty()); assertTrue(walk.state(owner).friends().isEmpty());
        assertFalse(mapper.writeValueAsString(revoked).contains("햇살실명"));
        friend(owner, "friend-request", guest); friend(guest, "friend-decline", owner);
        assertTrue(walk.state(guest).requests().isEmpty()); hidden(member(walk.state(guest), ownerId));
    }

    @Test void concurrentJoinsCannotExceedCapacityAndEachPersonHasOnlyOneRoom() throws Exception {
        String owner = person("방장"), second = person("둘"), third = person("셋"), fourth = person("넷"), fifth = person("다섯");
        String roomId = room(owner, 4); join(second, roomId); join(third, roomId);
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            var barrier = new CountDownLatch(1);
            Callable<Boolean> one = () -> { barrier.await(); try { join(fourth, roomId); return true; } catch (ResponseStatusException error) { return false; } };
            Callable<Boolean> two = () -> { barrier.await(); try { join(fifth, roomId); return true; } catch (ResponseStatusException error) { return false; } };
            var a = pool.submit(one); var b = pool.submit(two); barrier.countDown();
            assertNotEquals(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
        }
        assertEquals(4, walk.state(owner).room().memberCount());
        String another = room(second, 8);
        assertNotEquals(roomId, another); assertEquals(3, walk.state(owner).room().memberCount());
        assertEquals(1, walk.state(second).room().memberCount());
        join(second, another); assertEquals(1, walk.state(second).room().memberCount());
    }

    @Test void expiredPresenceReleasesCapacityAndDoesNotResurrectMembership() {
        String owner = person("오래기다림"), guest = person("잠시자리비움"); String roomId = room(owner, 4); join(guest, roomId);
        SocialProfile profile = profiles.findByPlayerId(guest).orElseThrow();
        profile.lastSeen = System.currentTimeMillis() - WalkService.PRESENCE_MS - 1000; profiles.save(profile);
        assertEquals(1, walk.state(owner).room().memberCount());
        assertNull(walk.state(guest).room());
        join(guest, roomId); assertEquals(2, walk.state(owner).room().memberCount());
    }

    @Test void invalidInputsAndRateLimitsAreEnforcedWithoutPartialChanges() {
        String id = person("검증친구"); room(id, 4);
        for (Map<String, Object> invalid : List.of(Map.<String, Object>of("nickname", ""), Map.<String, Object>of("nickname", "이름", "age", -1),
            Map.<String, Object>of("nickname", "이름", "photo", "https://example.com/photo.png"),
            Map.<String, Object>of("nickname", "이름", "photo", "data:image/svg+xml;base64,PHN2Zy8+"),
            Map.<String, Object>of("nickname", "이름", "photo", "data:image/png;base64,YmFk"),
            Map.<String, Object>of("nickname", "이름", "photo", "data:image/png;base64,iVBORw0KGgo="),
            Map.<String, Object>of("nickname", "이름", "photo", "data:image/png;base64," + "A".repeat(200001))))
            assertThrows(ResponseStatusException.class, () -> walk.act(id, "profile", input(invalid)));
        assertEquals("검증친구", walk.state(id).me().nickname());
        for (int capacity : List.of(0, 3, 9, 100)) assertThrows(ResponseStatusException.class, () -> room(id, capacity));
        assertThrows(ResponseStatusException.class, () -> join(id, "missing"));
        assertThrows(ResponseStatusException.class, () -> walk.act(id, "move", input(Map.of("x", 95, "y", 50))));
        assertThrows(ResponseStatusException.class, () -> walk.act(id, "message", input(Map.of("text", "가".repeat(501), "clientId", UUID.randomUUID().toString()))));
        assertThrows(ResponseStatusException.class, () -> walk.act(id, "message", input(Map.of("text", "내용", "clientId", "invalid"))));
        walk.act(id, "message", input(Map.of("text", "한 번", "clientId", UUID.randomUUID().toString())));
        var limited = assertThrows(ResponseStatusException.class, () -> walk.act(id, "message", input(Map.of("text", "바로 두 번", "clientId", UUID.randomUUID().toString()))));
        assertEquals(429, limited.getStatusCode().value());
        walk.act(id, "move", input(Map.of("x", 40, "y", 40)));
        assertEquals(429, assertThrows(ResponseStatusException.class, () -> walk.act(id, "move", input(Map.of("x", 41, "y", 40)))).getStatusCode().value());
        assertThrows(ResponseStatusException.class, () -> walk.act(id, "unsupported", empty()));
        assertThrows(ResponseStatusException.class, () -> walk.state("invalid-player"));
        assertThrows(ResponseStatusException.class, () -> walk.act(id, "friend-request", input(Map.of("targetId", id))));
    }

    @Test void browserPhotoPreservesItsExactValueAndOversizedRasterIsRejected() throws Exception {
        String id = visitor();
        String browserPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=";
        var result = walk.act(id, "profile", input(Map.of("nickname", "사진친구", "photo", browserPhoto)));
        assertEquals(browserPhoto, result.state().me().photo());
        var output = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(1025, 1, java.awt.image.BufferedImage.TYPE_INT_RGB), "png", output);
        String widePhoto = "data:image/png;base64," + Base64.getEncoder().encodeToString(output.toByteArray());
        assertThrows(ResponseStatusException.class, () -> walk.act(id, "profile", input(Map.of("nickname", "사진친구", "photo", widePhoto))));
    }

    @Test void historyKeepsOnlyLatestHundredAndProfileUpdatesPersistWithoutLeaking() {
        String owner = person("기록친구"), guest = person("구경친구"); String roomId = room(owner, 4); join(guest, roomId);
        String authorId = walk.state(owner).me().id();
        var old = new ArrayList<SocialMessage>();
        for (int i = 0; i < 100; i++) {
            var message = new SocialMessage(); message.id = UUID.randomUUID().toString(); message.authorId = authorId;
            message.roomId = roomId; message.dedupeKey = authorId + ":" + UUID.randomUUID(); message.text = "기록 " + i;
            message.createdAt = i; old.add(message);
        }
        messages.saveAll(old);
        walk.act(owner, "message", input(Map.of("text", "최신 인사", "clientId", UUID.randomUUID().toString())));
        var history = walk.state(guest).room().messages();
        assertEquals(100, history.size()); assertEquals("기록 1", history.getFirst().text()); assertEquals("최신 인사", history.getLast().text());
        walk.act(owner, "profile", input(Map.of("nickname", "바뀐닉네임", "age", 45, "realName", "바뀐실명", "photo", PHOTO)));
        var viewed = walk.state(guest);
        assertEquals("바뀐닉네임", viewed.room().messages().getFirst().author().nickname()); hidden(viewed.room().messages().getFirst().author());
        assertEquals(45, viewed.room().owner().age());
        assertEquals("바뀐실명", profiles.findByPlayerId(owner).orElseThrow().realName);
    }
}
