package com.puppyruby.appearance;

import com.puppyruby.admin.AdminAppearanceService;
import com.puppyruby.auth.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:appearance-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop",
    "MAIL_ENABLED=false", "KAKAO_REST_API_KEY=", "ADMIN_EMAIL="
})
class AppearanceServiceTest {
    @Autowired AppearanceService appearance;
    @Autowired AppearanceRepository settings;
    @Autowired AdminAppearanceService admin;
    @Autowired AuthService auth;
    @Autowired AccountRepository accounts;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    @LocalServerPort int port;
    Identity operator;
    record Identity(Account account, String token) {}
    record Outcome(Integer status, AppearanceService.Config config) {}

    @BeforeEach void setup() {
        settings.deleteAll();
        jdbc.update("delete from admin_audit where target_type = 'APPEARANCE'");
        operator = account(Account.Role.ADMIN, true, Account.Status.ACTIVE);
    }
    Identity account(Account.Role role, boolean verified, Account.Status status) {
        var registration = auth.register(UUID.randomUUID().toString(), new AuthService.Register(
            UUID.randomUUID() + "@appearance.test", "Appearance-Test!2026", "스타일 검증"));
        Account account = accounts.findById(registration.user().id()).orElseThrow();
        account.role = role; account.emailVerified = verified; account.status = status;
        accounts.save(account);
        return new Identity(account, registration.token());
    }
    Map<String, Object> input(String style, Map<String, String> breeds, long revision) {
        return Map.of("defaultStyle", style, "breedStyles", breeds, "expectedRevision", revision);
    }
    HttpResponse<String> http(String method, String path, String token, String body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(10));
        request.header("X-Player-Id", operator.account.playerId); // A guest header never grants administrator permissions.
        if (token != null) request.header("X-Session-Token", token);
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        if (body != null) request.header("Content-Type", "application/json");
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    long auditCount() {
        return jdbc.queryForObject("select count(*) from admin_audit where target_type = 'APPEARANCE'", Long.class);
    }
    void rejected(int status, Runnable action) {
        assertEquals(status, assertThrows(ResponseStatusException.class, action::run).getStatusCode().value());
    }

    @Test void absentConfigurationIsPublicClassicAndDoesNotCreateOrExposePrivateRecords() throws Exception {
        var response = http("GET", "/api/v1/appearance", null, null);
        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("Cache-Control").orElse("").contains("no-store"));
        var body = mapper.readValue(response.body(), Map.class);
        assertEquals(Set.of("defaultStyle", "breedStyles", "revision", "updatedAt"), body.keySet());
        assertEquals("classic", body.get("defaultStyle"));
        assertEquals(Map.of(), body.get("breedStyles"));
        assertEquals(0, ((Number) body.get("revision")).longValue());
        assertNull(body.get("updatedAt"));
        assertEquals(0, settings.count()); assertEquals(0, auditCount());
        assertEquals(appearance.current(), admin.current(operator.token));
    }

    @Test void guestsMembersUnverifiedAndSuspendedAdminsCannotReadAdminConfigurationOrWrite() throws Exception {
        var member = account(Account.Role.USER, true, Account.Status.ACTIVE);
        var unverified = account(Account.Role.ADMIN, false, Account.Status.ACTIVE);
        var suspended = account(Account.Role.ADMIN, true, Account.Status.SUSPENDED);
        for (String token : Arrays.asList(null, "invalid", member.token, unverified.token, suspended.token)) {
            int expected = token == null || token.equals("invalid") ? 401 : 403;
            assertEquals(expected, http("GET", "/api/v1/admin/appearance", token, null).statusCode());
            assertEquals(expected, http("POST", "/api/v1/admin/appearance", token,
                mapper.writeValueAsString(input("round", Map.of("poodle", "fluffy"), 0))).statusCode());
            // Public appearance remains safe even when a browser has a stale/invalid account cookie.
            assertEquals(200, http("GET", "/api/v1/appearance", token, null).statusCode());
        }
        assertEquals(new AppearanceService.Config("classic", Map.of(), 0, null), appearance.current());
        assertEquals(0, settings.count()); assertEquals(0, auditCount());
    }

    @Test void savesAllFieldsAtomicallyAndRemovingAnOverrideRestoresInheritance() throws Exception {
        long before = System.currentTimeMillis();
        var first = admin.save(operator.token, input("round", Map.of("poodle", "fluffy", "shiba", "bold"), 0));
        assertEquals(1, first.revision()); assertTrue(first.updatedAt() >= before);
        assertEquals("fluffy", first.breedStyles().getOrDefault("poodle", first.defaultStyle()));
        assertEquals("round", first.breedStyles().getOrDefault("maltese", first.defaultStyle()));
        var response = http("POST", "/api/v1/admin/appearance", operator.token,
            mapper.writeValueAsString(input("mochi", Map.of("shiba", "cookie"), 1)));
        assertEquals(200, response.statusCode());
        var next = mapper.readValue(response.body(), AppearanceService.Config.class);
        assertEquals(2, next.revision());
        assertEquals(Map.of("shiba", "cookie"), next.breedStyles());
        assertEquals("mochi", next.breedStyles().getOrDefault("poodle", next.defaultStyle()));
        assertEquals(next, appearance.current()); assertEquals(next, admin.current(operator.token));
        var repeated = admin.save(operator.token, input("mochi", Map.of("shiba", "cookie"), 2));
        assertEquals(3, repeated.revision()); // Even an identical successful save has an unambiguous new revision.
        assertEquals(1, settings.count()); assertEquals(3, auditCount());
        var audit = jdbc.queryForList("select actor_id, target_id, action, reason from admin_audit where target_type = 'APPEARANCE'");
        assertTrue(audit.stream().allMatch(row -> row.get("actor_id").equals(operator.account.id)
            && row.get("target_id").equals("global") && row.get("action").equals("APPEARANCE_UPDATE")));
        assertTrue(audit.stream().anyMatch(row -> row.get("reason").toString().contains("cookie")));
    }

    @Test void everyCanonicalStyleAndBreedIsAccepted() {
        long revision = 0;
        for (String style : AppearanceService.STYLES) {
            Map<String, String> overrides = new LinkedHashMap<>();
            AppearanceService.BREEDS.forEach(breed -> overrides.put(breed, style));
            var result = admin.save(operator.token, input(style, overrides, revision++));
            assertEquals(style, result.defaultStyle()); assertEquals(overrides, result.breedStyles());
            assertEquals(revision, result.revision());
        }
        assertEquals(16, revision); assertEquals(16, auditCount());
    }

    @Test void malformedMissingUnknownAndCoercedInputsAreRejectedWithoutChanges() throws Exception {
        var original = admin.save(operator.token, input("round", Map.of("beagle", "badge"), 0));
        var invalid = List.of("null", "[]", "{}", "{\"defaultStyle\":\"classic\",\"breedStyles\":{}}",
            "{\"defaultStyle\":null,\"breedStyles\":{},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"unknown\",\"breedStyles\":{},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"ROUND\",\"breedStyles\":{},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":null,\"expectedRevision\":1}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":[],\"expectedRevision\":1}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":{\"husky\":\"classic\"},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":{\"poodle\":null},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":{\"poodle\":\"unknown\"},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":{\"poodle\":{}},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":{},\"expectedRevision\":null}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":{},\"expectedRevision\":-1}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":{},\"expectedRevision\":\"1\"}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":{},\"expectedRevision\":1.0}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":{},\"expectedRevision\":true}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":{},\"expectedRevision\":9007199254740992}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":{},\"expectedRevision\":1,\"role\":\"ADMIN\"}");
        for (String body : invalid) {
            assertEquals(400, http("POST", "/api/v1/admin/appearance", operator.token, body).statusCode(), body);
            assertEquals(original, appearance.current());
        }
        assertEquals(1, auditCount());
    }

    @Test void staleRevisionsConflictWithoutOverwritingCurrentSettingsOrWritingAudit() throws Exception {
        var original = admin.save(operator.token, input("plush", Map.of("corgi", "pocket"), 0));
        for (long revision : List.of(0L, 2L, 100L)) {
            assertEquals(409, http("POST", "/api/v1/admin/appearance", operator.token,
                mapper.writeValueAsString(input("retro", Map.of(), revision))).statusCode());
            assertEquals(original, appearance.current());
        }
        assertEquals(1, auditCount());
    }

    @Test void concurrentFirstWritesCreateOnlyOneSingletonAndOneSuccessfulRevision() throws Exception {
        race(0);
        assertEquals(1, settings.count()); assertEquals(1, auditCount());
        race(1);
        assertEquals(1, settings.count()); assertEquals(2, auditCount());
    }
    private void race(long revision) throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Outcome>> tasks = new ArrayList<>();
            for (String style : List.of("round", "fluffy")) tasks.add(pool.submit(() -> {
                start.await();
                try { return new Outcome(200, admin.save(operator.token, input(style, Map.of("poodle", style), revision))); }
                catch (ResponseStatusException error) { return new Outcome(error.getStatusCode().value(), null); }
            }));
            start.countDown();
            var first = tasks.get(0).get(15, TimeUnit.SECONDS); var second = tasks.get(1).get(15, TimeUnit.SECONDS);
            assertEquals(Set.of(200, 409), Set.of(first.status, second.status));
            var winner = first.status == 200 ? first.config : second.config;
            assertEquals(revision + 1, winner.revision()); assertEquals(winner, appearance.current());
        }
    }
}
