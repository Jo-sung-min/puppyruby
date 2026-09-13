package com.puppyruby.seo;

import com.puppyruby.admin.AdminSeoService;
import com.puppyruby.auth.*;
import org.junit.jupiter.api.*;
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
    "spring.datasource.url=jdbc:h2:mem:seo-test;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop",
    "MAIL_ENABLED=false", "KAKAO_REST_API_KEY=", "ADMIN_EMAIL="
})
class SeoServiceTest {
    @Autowired SeoService seo;
    @Autowired SeoRepository settings;
    @Autowired AdminSeoService admin;
    @Autowired AuthService auth;
    @Autowired AccountRepository accounts;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @LocalServerPort int port;
    Identity operator;
    record Identity(Account account, String token) {}
    record Outcome(int status, SeoService.Config config) {}

    @BeforeEach void setup() {
        settings.deleteAll(); jdbc.update("delete from admin_audit where target_type = 'SEO'");
        operator = account(Account.Role.ADMIN, true, Account.Status.ACTIVE);
    }
    Identity account(Account.Role role, boolean verified, Account.Status status) {
        var registration = auth.register(UUID.randomUUID().toString(), new AuthService.Register(UUID.randomUUID() + "@seo.test", "Seo-Test!2026-password", "검색 검증"));
        Account account = accounts.findById(registration.user().id()).orElseThrow();
        account.role = role; account.emailVerified = verified; account.status = status; accounts.save(account);
        return new Identity(account, registration.token());
    }
    Map<String, Object> input(long revision) {
        var defaults = SeoService.defaults(); var value = new LinkedHashMap<String, Object>();
        value.put("siteName", defaults.siteName()); value.put("siteUrl", defaults.siteUrl()); value.put("defaultTitle", defaults.defaultTitle());
        value.put("defaultDescription", defaults.defaultDescription()); value.put("ogImageUrl", defaults.ogImageUrl()); value.put("ogImageAlt", defaults.ogImageAlt());
        value.put("googleVerification", defaults.googleVerification()); value.put("naverVerification", defaults.naverVerification()); value.put("indexingEnabled", defaults.indexingEnabled());
        var pages = new LinkedHashMap<String, Object>(); defaults.pages().forEach((key, page) -> pages.put(key, new LinkedHashMap<>(Map.of("title", page.title(), "description", page.description(), "indexable", page.indexable()))));
        value.put("pages", pages); value.put("expectedRevision", revision); return value;
    }
    Map<String, Object> changed(long revision, String key, Object value) { var input = input(revision); input.put(key, value); return input; }
    long auditCount() { return jdbc.queryForObject("select count(*) from admin_audit where target_type='SEO'", Long.class); }
    void rejected(int status, Runnable action) { assertEquals(status, assertThrows(ResponseStatusException.class, action::run).getStatusCode().value()); }
    HttpResponse<String> http(String method, String token, String body, boolean adminPath) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + (adminPath ? "/api/v1/admin/seo" : "/api/v1/seo"))).timeout(Duration.ofSeconds(10));
        request.header("X-Player-Id", operator.account.playerId);
        if (token != null) request.header("X-Session-Token", token);
        if (body != null) request.header("Content-Type", "application/json");
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        var response = HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
        assertTrue(response.headers().firstValue("Cache-Control").orElse("").contains("no-store"));
        return response;
    }

    @Test void publicDefaultsPreserveExistingMetadataAndDoNotSeedOrExposeAccountData() throws Exception {
        var response = http("GET", null, null, false); assertEquals(200, response.statusCode());
        var config = mapper.readValue(response.body(), SeoService.Config.class); assertEquals(SeoService.defaults(), config);
        assertEquals(Set.of("siteName", "siteUrl", "defaultTitle", "defaultDescription", "ogImageUrl", "ogImageAlt", "googleVerification", "naverVerification", "indexingEnabled", "pages", "revision", "updatedAt"), mapper.readValue(response.body(), Map.class).keySet());
        assertEquals("PuppyRuby · 너의 하루에 작은 멍! 하나", config.defaultTitle()); assertEquals("우리 집 · PuppyRuby", config.pages().get("play").title());
        assertEquals("상점 · PuppyRuby", config.pages().get("shop").title()); assertTrue(config.indexingEnabled());
        assertTrue(config.pages().values().stream().allMatch(SeoService.Page::indexable)); assertTrue(config.siteUrl().isEmpty());
        assertEquals(0, settings.count()); assertEquals(0, auditCount());
        assertFalse(response.body().contains(operator.account.id)); assertFalse(response.body().contains(operator.account.email));
        assertEquals(405, http("POST", operator.token, mapper.writeValueAsString(input(0)), false).statusCode());
    }

    @Test void guestsMembersUnverifiedAndSuspendedAdminsCannotReadOrWriteSettings() throws Exception {
        var member = account(Account.Role.USER, true, Account.Status.ACTIVE);
        var unverified = account(Account.Role.ADMIN, false, Account.Status.ACTIVE);
        var suspended = account(Account.Role.ADMIN, true, Account.Status.SUSPENDED);
        for (String token : Arrays.asList(null, "invalid", member.token, unverified.token, suspended.token)) {
            int expected = token == null || token.equals("invalid") ? 401 : 403;
            assertEquals(expected, http("GET", token, null, true).statusCode());
            assertEquals(expected, http("POST", token, mapper.writeValueAsString(changed(0, "siteName", "changed")), true).statusCode());
            assertEquals(200, http("GET", token, null, false).statusCode());
        }
        assertEquals(SeoService.defaults(), seo.current()); assertEquals(0, settings.count()); assertEquals(0, auditCount());
    }

    @Test void allFieldsPersistAtomicallyAndEmptyFieldsRetainInheritanceIntent() throws Exception {
        var input = input(0); input.put("siteName", "  퍼피루비  "); input.put("siteUrl", "HTTPS://PUPPYRUBY.EXAMPLE:443/");
        input.put("defaultTitle", " 새 제목 "); input.put("defaultDescription", " 새 설명 ");
        input.put("ogImageUrl", "https://never-fetch.invalid/puppy.png?version=1#image"); input.put("ogImageAlt", " 강아지 ");
        input.put("googleVerification", " google_abc-123 "); input.put("naverVerification", "naver_abc-123"); input.put("indexingEnabled", false);
        input.put("pages", Map.of("home", Map.of("title", "", "description", "", "indexable", false),
            "play", Map.of("title", "우리 집 새 제목", "description", "놀이 설명", "indexable", true),
            "shop", Map.of("title", "상점 새 제목", "description", "", "indexable", false)));
        long before = System.currentTimeMillis(); var saved = admin.save(operator.token, input);
        assertEquals(1, saved.revision()); assertTrue(saved.updatedAt() >= before); assertEquals("퍼피루비", saved.siteName());
        assertEquals("https://puppyruby.example", saved.siteUrl()); assertEquals("새 제목", saved.defaultTitle()); assertEquals("새 설명", saved.defaultDescription());
        assertEquals(input.get("ogImageUrl"), saved.ogImageUrl()); assertEquals("강아지", saved.ogImageAlt()); assertEquals("google_abc-123", saved.googleVerification());
        assertFalse(saved.indexingEnabled()); assertFalse(saved.pages().get("home").indexable()); assertTrue(saved.pages().get("home").title().isEmpty());
        assertEquals(3, jdbc.queryForObject("select count(*) from seo_pages", Integer.class));
        assertEquals(saved, seo.current()); assertEquals(saved, admin.current(operator.token));
        assertEquals(saved, mapper.readValue(http("GET", null, null, false).body(), SeoService.Config.class));
        var cleared = admin.save(operator.token, input(1)); assertEquals(2, cleared.revision());
        assertTrue(cleared.siteUrl().isEmpty()); assertTrue(cleared.ogImageUrl().isEmpty()); assertTrue(cleared.googleVerification().isEmpty()); assertTrue(cleared.indexingEnabled());
        assertEquals(2, auditCount());
        String reason = jdbc.queryForList("select reason from admin_audit where target_type='SEO'").stream().map(row -> row.get("reason").toString()).filter(value -> value.contains("퍼피루비")).findFirst().orElseThrow();
        assertFalse(reason.contains("google_abc")); assertFalse(reason.contains("never-fetch"));
    }

    @Test void strictFieldsBooleansRevisionsAndPageShapeAreRequired() throws Exception {
        var original = admin.save(operator.token, input(0)); var malformed = new ArrayList<Map<String, Object>>();
        for (String field : input(1).keySet()) { var body = input(1); body.remove(field); malformed.add(body); }
        malformed.add(changed(1, "unknown", "field"));
        for (Object value : Arrays.asList(null, -1, "1", 1.0, true, 9_007_199_254_740_992L)) malformed.add(changed(1, "expectedRevision", value));
        for (Object value : Arrays.asList(null, "true", 1)) malformed.add(changed(1, "indexingEnabled", value));
        for (Object value : Arrays.asList(null, List.of(), "pages", Map.of(), Map.of("account", Map.of()))) malformed.add(changed(1, "pages", value));
        for (Object page : Arrays.asList(null, List.of(), "page", Map.of("title", "title", "description", "description"),
            Map.of("title", "title", "description", "description", "indexable", "true"), Map.of("title", 1, "description", "description", "indexable", true),
            Map.of("title", "title", "description", "description", "indexable", true, "extra", 1))) {
            var pages = new LinkedHashMap<String, Object>(); pages.put("home", page); pages.put("play", Map.of("title", "", "description", "", "indexable", true)); pages.put("shop", Map.of("title", "", "description", "", "indexable", true));
            malformed.add(changed(1, "pages", pages));
        }
        for (var body : malformed) { assertEquals(400, http("POST", operator.token, mapper.writeValueAsString(body), true).statusCode()); assertEquals(original, seo.current()); }
        for (String body : List.of("null", "[]", "{}")) assertEquals(400, http("POST", operator.token, body, true).statusCode());
        assertEquals(1, auditCount());
    }

    @Test void textLimitsUnicodeControlsUrlsAndVerificationTokensAreValidated() {
        var invalid = new LinkedHashMap<String, List<Object>>();
        invalid.put("siteName", Arrays.asList(null, "", "  ", "🐶".repeat(61), "\n앞 제어문자", "중간\u200B숨김", 1));
        invalid.put("defaultTitle", Arrays.asList(null, "", "가".repeat(101), "끝 제어문자\t"));
        invalid.put("defaultDescription", Arrays.asList(null, "", "가".repeat(301)));
        invalid.put("ogImageAlt", Arrays.asList(null, "가".repeat(161), "줄\n바꿈"));
        invalid.put("siteUrl", Arrays.asList(null, "http://example.com", "javascript:alert(1)", "https://user:secret@example.com", "https://example.com/path", "https://example.com?x=y", "https://example.com#hash", "https://example.com:99999", "https://example.com:0", "https://", "https://" + "a".repeat(290) + ".example"));
        invalid.put("ogImageUrl", Arrays.asList(null, "http://example.com/image.png", "data:image/png;base64,AA==", "//example.com/image.png", "https://user:password@example.com/photo.png", "https://example.com/" + "a".repeat(2048)));
        invalid.put("googleVerification", Arrays.asList(null, "a".repeat(201), "<meta name=\"google-site-verification\" content=\"abc\">", "https://example.com/token", "a b"));
        invalid.put("naverVerification", Arrays.asList(null, "meta=abc", "abc\n", "한글"));
        for (var entry : invalid.entrySet()) for (Object value : entry.getValue()) {
            rejected(400, () -> admin.save(operator.token, changed(0, entry.getKey(), value))); assertEquals(SeoService.defaults(), seo.current());
        }
        var maximum = input(0); maximum.put("siteName", "🐶".repeat(60)); maximum.put("defaultTitle", "🐶".repeat(100));
        maximum.put("defaultDescription", "🐶".repeat(300)); maximum.put("ogImageAlt", "🐶".repeat(160));
        maximum.put("googleVerification", "a".repeat(200)); maximum.put("naverVerification", "Naver_123-ABC");
        var saved = admin.save(operator.token, maximum); assertEquals("🐶".repeat(100), saved.defaultTitle());
        assertEquals(saved, seo.current()); assertEquals(1, auditCount());
    }

    @Test void staleRevisionsCannotOverwriteSettingsOrCreateAudit() {
        var original = admin.save(operator.token, changed(0, "siteName", "최신 사이트"));
        for (long revision : List.of(0L, 2L, 100L)) rejected(409, () -> admin.save(operator.token, changed(revision, "siteName", "이전 화면")));
        assertEquals(original, seo.current()); assertEquals(1, auditCount());
    }

    @Test void canonicalSiteOriginRejectsPrivateAndLocalAddressesWithoutFetchingThem() {
        for (String host : List.of("localhost", "localhost.", "preview.localhost", "puppyruby.local", "singlelabel", "127.0.0.1", "10.2.3.4",
            "0.0.0.0", "169.254.169.254", "172.16.0.1", "172.20.8.9", "172.31.255.254", "192.168.1.2", "224.0.0.1", "255.255.255.255",
            "[::1]", "[2001:4860:4860::8888]", "0177.0.0.1", "127.1", "2130706433")) {
            rejected(400, () -> admin.save(operator.token, changed(0, "siteUrl", "https://" + host)));
            assertEquals(SeoService.defaults(), seo.current());
        }
        for (String origin : List.of("https://puppyruby.example", "https://puppyruby.vercel.app", "https://8.8.8.8", "https://172.15.0.1", "https://172.32.0.1")) {
            var saved = admin.save(operator.token, changed(seo.current().revision(), "siteUrl", origin)); assertEquals(origin, saved.siteUrl());
        }
    }

    @Test void simultaneousFirstAndLaterWritesHaveOneWinnerAndOneAuditPerRevision() throws Exception {
        race(0); assertEquals(1, settings.count()); assertEquals(1, auditCount());
        race(1); assertEquals(1, settings.count()); assertEquals(2, auditCount());
    }
    void race(long revision) throws Exception {
        try (var pool = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1); var outcomes = new ArrayList<Future<Outcome>>();
            for (String name : List.of("첫 제목", "둘째 제목")) outcomes.add(pool.submit(() -> {
                start.await();
                try { return new Outcome(200, admin.save(operator.token, changed(revision, "defaultTitle", name))); }
                catch (ResponseStatusException error) { return new Outcome(error.getStatusCode().value(), null); }
            }));
            start.countDown(); var first = outcomes.get(0).get(15, TimeUnit.SECONDS); var second = outcomes.get(1).get(15, TimeUnit.SECONDS);
            assertEquals(Set.of(200, 409), Set.of(first.status, second.status));
            var winner = first.status == 200 ? first.config : second.config; assertEquals(revision + 1, winner.revision()); assertEquals(winner, seo.current());
        }
    }
}
