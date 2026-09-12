package com.puppyruby.admin;

import com.puppyruby.auth.*;
import com.puppyruby.desktop.DesktopService;
import com.puppyruby.game.GameService;
import com.puppyruby.walk.WalkService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:admin-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop",
    "MAIL_ENABLED=false", "KAKAO_CLIENT_ID=", "ADMIN_EMAIL="
})
class AdminServiceTest {
    static final String PASSWORD = "AdminTest!Password123";
    @Autowired AdminService admin;
    @Autowired AuthService auth;
    @Autowired AccountRepository accounts;
    @Autowired AdminAuditRepository audits;
    @Autowired WalkService walk;
    @Autowired GameService game;
    @Autowired DesktopService desktop;
    @Autowired ObjectMapper mapper;
    @LocalServerPort int port;
    Identity operator;
    record Identity(Account account, String token) {}

    Identity account(String name, boolean isAdmin) {
        String suffix = UUID.randomUUID().toString();
        var result = auth.register(UUID.randomUUID().toString(), new AuthService.Register(suffix + "@example.test", PASSWORD, name));
        Account account = accounts.findById(result.user().id()).orElseThrow();
        if (isAdmin) { account.role = Account.Role.ADMIN; account.emailVerified = true; accounts.save(account); }
        return new Identity(account, result.token());
    }
    @BeforeEach void setup() { operator = account("운영자", true); }
    WalkService.Action input(Map<String, Object> values) { return mapper.convertValue(values, WalkService.Action.class); }
    void profile(Identity person, String nickname) {
        walk.act(person.account.playerId, "profile", input(Map.of("nickname", nickname, "realName", "친구에게만 공개하는 이름")));
    }
    String room(Identity person) {
        profile(person, "산책 보호자");
        return walk.act(person.account.playerId, "create", input(Map.of("title", "검증용 산책방", "description", "함께 산책해요", "theme", "meadow", "capacity", 4))).state().room().id();
    }
    int http(String method, String path, String token, String body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(10));
        request.header("X-Player-Id", operator.account.playerId); // Cannot spoof admin through a guest header.
        if (token != null) request.header("X-Session-Token", token);
        if (body == null) request.GET();
        else request.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(body));
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
    }
    void rejected(int status, Runnable action) {
        assertEquals(status, assertThrows(ResponseStatusException.class, action::run).getStatusCode().value());
    }

    @Test void everyAdminEndpointRejectsGuestsMembersAndUnverifiedAdminRoles() throws Exception {
        Identity user = account("일반 회원", false);
        Identity unverified = account("아직 인증 전", false);
        unverified.account.role = Account.Role.ADMIN; accounts.save(unverified.account);
        for (String path : List.of("/overview", "/members", "/rooms", "/rooms/missing/messages")) {
            assertEquals(401, http("GET", "/api/v1/admin" + path, null, null));
            assertEquals(403, http("GET", "/api/v1/admin" + path, user.token, null));
            assertEquals(403, http("GET", "/api/v1/admin" + path, unverified.token, null));
        }
        for (String path : List.of("/members/" + user.account.id + "/status", "/rooms/missing/close", "/messages/missing/hide")) {
            String body = "{\"status\":\"SUSPENDED\",\"reason\":\"관리 사유\"}";
            assertEquals(401, http("POST", "/api/v1/admin" + path, null, body));
            assertEquals(403, http("POST", "/api/v1/admin" + path, user.token, body));
            assertEquals(403, http("POST", "/api/v1/admin" + path, unverified.token, body));
        }
        assertEquals(Account.Status.ACTIVE, accounts.findById(user.account.id).orElseThrow().status);
        assertTrue(audits.findByTargetIdOrderByCreatedAtAsc(user.account.id).isEmpty());
        assertEquals(200, http("GET", "/api/v1/admin/overview", operator.token, null));
    }

    @Test void selfAndOtherAdminsCannotBeSuspendedAndRejectedRequestsKeepTheirSessions() {
        Identity another = account("다른 운영자", true);
        for (Identity target : List.of(operator, another)) {
            rejected(403, () -> admin.status(operator.token, target.account.id, "SUSPENDED", "잘못 선택"));
            assertEquals(Account.Status.ACTIVE, auth.requireAdmin(target.token).status);
            assertTrue(audits.findByTargetIdOrderByCreatedAtAsc(target.account.id).isEmpty());
        }
    }

    @Test void suspensionRevokesEveryWebAndDesktopCredentialAndReactivationDoesNotRestoreThem() throws Exception {
        Identity user = account("정지 검증", false);
        var second = auth.login(new AuthService.Login(user.account.email, PASSWORD));
        String code = desktop.pairCode(user.account.playerId).code();
        var device = desktop.pair(new DesktopService.PairInput(code, "검증 PC"));
        String unusedCode = desktop.pairCode(user.account.playerId).code();
        admin.status(operator.token, user.account.id, "SUSPENDED", "반복적인 산책방 방해");
        rejected(401, () -> auth.requireAccount(user.token));
        rejected(401, () -> auth.requireAccount(second.token()));
        rejected(403, () -> auth.assertPlayerActive(user.account.playerId));
        rejected(403, () -> auth.login(new AuthService.Login(user.account.email, PASSWORD)));
        rejected(401, () -> desktop.state(device.token()));
        rejected(400, () -> desktop.pair(new DesktopService.PairInput(unusedCode, "검증 PC")));
        assertEquals(401, http("GET", "/api/v1/game", user.token, null));
        var history = audits.findByTargetIdOrderByCreatedAtAsc(user.account.id);
        assertEquals(1, history.size());
        assertEquals(operator.account.id, history.getFirst().actorId);
        assertEquals("MEMBER_SUSPENDED", history.getFirst().action);
        assertEquals("반복적인 산책방 방해", history.getFirst().reason);
        assertTrue(history.getFirst().createdAt > 0);
        admin.status(operator.token, user.account.id, "ACTIVE", "이용 안내 확인");
        rejected(401, () -> auth.requireAccount(user.token));
        rejected(401, () -> desktop.state(device.token()));
        assertNotNull(auth.login(new AuthService.Login(user.account.email, PASSWORD)).token());
        assertEquals(2, audits.findByTargetIdOrderByCreatedAtAsc(user.account.id).size());
    }

    @Test void concurrentLoginAndSuspensionCannotLeaveAValidSession() throws Exception {
        Identity user = account("동시 로그인", false);
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1);
            var login = pool.submit(() -> { start.await(); try { return auth.login(new AuthService.Login(user.account.email, PASSWORD)).token(); }
                catch (ResponseStatusException expected) { assertEquals(403, expected.getStatusCode().value()); return null; } });
            var suspension = pool.submit(() -> { start.await(); admin.status(operator.token, user.account.id, "SUSPENDED", "동시 요청 검증"); return true; });
            start.countDown(); assertTrue(suspension.get(15, TimeUnit.SECONDS));
            String issued = login.get(15, TimeUnit.SECONDS);
            if (issued != null) rejected(401, () -> auth.requireAccount(issued));
            rejected(403, () -> auth.assertPlayerActive(user.account.playerId));
        }
    }

    @Test void moderationHidesRealMessagesClosesRoomsEvictsParticipantsAndWritesAudit() throws Exception {
        Identity owner = account("방 주인", false), guest = account("참여자", false);
        String roomId = room(owner); profile(guest, "함께 온 보호자");
        walk.act(guest.account.playerId, "join", input(Map.of("roomId", roomId)));
        var sent = walk.act(owner.account.playerId, "message", input(Map.of("text", "관리 대상 메시지", "clientId", UUID.randomUUID().toString())));
        String messageId = sent.state().room().messages().getFirst().id();
        var listed = admin.rooms(operator.token, 0).items().stream().filter(r -> r.id().equals(roomId)).findFirst().orElseThrow();
        assertEquals(2, listed.memberCount()); assertEquals(1, listed.messageCount());
        var messages = admin.messages(operator.token, roomId, 0);
        assertEquals("산책 보호자", messages.items().getFirst().authorLabel());
        assertFalse(mapper.writeValueAsString(messages).contains("친구에게만 공개하는 이름"));
        admin.hideMessage(operator.token, messageId, "부적절한 대화");
        assertTrue(walk.state(guest.account.playerId).room().messages().isEmpty());
        assertTrue(admin.messages(operator.token, roomId, 0).items().isEmpty());
        rejected(409, () -> admin.hideMessage(operator.token, messageId, "다시 숨김"));
        assertEquals(1, audits.findByTargetIdOrderByCreatedAtAsc(messageId).size());
        admin.closeRoom(operator.token, roomId, "운영 규칙 위반");
        assertNull(walk.state(owner.account.playerId).room()); assertNull(walk.state(guest.account.playerId).room());
        assertTrue(walk.state(owner.account.playerId).rooms().stream().noneMatch(r -> r.id().equals(roomId)));
        rejected(400, () -> walk.act(guest.account.playerId, "join", input(Map.of("roomId", roomId))));
        rejected(400, () -> walk.act(owner.account.playerId, "message", input(Map.of("text", "다시 전송", "clientId", UUID.randomUUID().toString()))));
        rejected(400, () -> walk.act(owner.account.playerId, "move", input(Map.of("x", 40, "y", 40))));
        rejected(409, () -> admin.closeRoom(operator.token, roomId, "다시 닫기"));
        assertEquals("ROOM_CLOSE", audits.findByTargetIdOrderByCreatedAtAsc(roomId).getFirst().action);
    }

    @Test void aClosedOfficialRoomIsNotReseededOnRestart() {
        admin.closeRoom(operator.token, "official-night", "공식 방 점검");
        walk.initialize();
        assertTrue(walk.state(UUID.randomUUID().toString()).rooms().stream().noneMatch(room -> room.id().equals("official-night")));
    }

    @Test void paginationSearchAndMemberResponsesAreBoundedAndDoNotExposeCredentials() throws Exception {
        String marker = "검색" + UUID.randomUUID().toString().substring(0, 8);
        var before = admin.overview(operator.token);
        for (int index = 0; index < 32; index++) {
            Account account = new Account(); account.id = UUID.randomUUID().toString(); account.playerId = UUID.randomUUID().toString();
            account.displayName = marker + index; account.email = account.id + "@example.test"; account.passwordHash = "not-a-public-field";
            account.createdAt = System.currentTimeMillis(); accounts.save(account);
            if (index == 0) game.state(account.playerId);
        }
        var first = admin.members(operator.token, 0, marker); var second = admin.members(operator.token, 1, marker);
        assertEquals(30, first.items().size()); assertEquals(2, second.items().size());
        assertEquals(32, first.totalElements()); assertEquals(2, first.totalPages());
        assertTrue(Collections.disjoint(first.items().stream().map(AdminService.Member::id).toList(), second.items().stream().map(AdminService.Member::id).toList()));
        assertEquals(1, first.items().stream().mapToInt(AdminService.Member::puppyCount).sum() + second.items().stream().mapToInt(AdminService.Member::puppyCount).sum());
        assertFalse(mapper.writeValueAsString(first).contains("passwordHash"));
        assertFalse(mapper.writeValueAsString(first).contains("playerId"));
        assertEquals(0, admin.members(operator.token, 0, "%_").totalElements());
        assertEquals(before.members() + 32, admin.overview(operator.token).members());
        assertEquals(before.puppies() + 1, admin.overview(operator.token).puppies());
        rejected(400, () -> admin.members(operator.token, -1, ""));
        rejected(400, () -> admin.rooms(operator.token, 10001));
        rejected(400, () -> admin.members(operator.token, 0, "x".repeat(101)));
    }

    @Test void invalidReasonsAndMissingTargetsDoNotRecordOrApplyModeration() {
        Identity user = account("사유 검증", false); String roomId = room(user);
        for (String reason : List.of("", "   ", "x".repeat(301), "숨은\u0001문자")) {
            rejected(400, () -> admin.status(operator.token, user.account.id, "SUSPENDED", reason));
            rejected(400, () -> admin.closeRoom(operator.token, roomId, reason));
        }
        rejected(400, () -> admin.status(operator.token, user.account.id, "ADMIN", "잘못된 상태"));
        rejected(404, () -> admin.status(operator.token, "missing", "SUSPENDED", "대상 없음"));
        rejected(404, () -> admin.closeRoom(operator.token, "missing", "대상 없음"));
        rejected(404, () -> admin.hideMessage(operator.token, "missing", "대상 없음"));
        assertEquals(Account.Status.ACTIVE, auth.requireAccount(user.token).status);
        assertNotNull(walk.state(user.account.playerId).room());
        assertTrue(audits.findByTargetIdOrderByCreatedAtAsc(user.account.id).isEmpty());
        assertTrue(audits.findByTargetIdOrderByCreatedAtAsc(roomId).isEmpty());
    }
}
