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

    @BeforeEach void setup() {
        settings.deleteAll();
        jdbc.update("delete from admin_audit where target_type = 'APPEARANCE'");
        operator = account(Account.Role.ADMIN, true, Account.Status.ACTIVE);
    }

    @Test void absentConfigurationIsPublicRubyAndDoesNotCreatePrivateRecords() throws Exception {
        var response = http("GET", "/api/v1/appearance", null, null);
        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("Cache-Control").orElse("").contains("no-store"));
        var body = mapper.readValue(response.body(), Map.class);
        assertEquals(AppearanceService.DEFAULT_STYLE, body.get("defaultStyle"));
        assertEquals(Map.of(), body.get("breedStyles"));
        assertEquals(List.of(), body.get("deletedStyles"));
        assertEquals(List.of(), body.get("varieties"));
        assertEquals(Map.of(), body.get("breedVarieties"));
        assertEquals(0, ((Number) body.get("revision")).longValue());
        assertNull(body.get("updatedAt"));
        assertEquals(0, settings.count());
    }

    @Test void onlyRubyRoundCanBeSavedAndRetiredAssetIdsAreRejected() {
        assertEquals(List.of(AppearanceService.DEFAULT_STYLE), AppearanceService.STYLES);
        for (String retired : List.of("classic", "art-16-scenes", "sp08-scenes", "premium-caramel", "animated-2d")) {
            var body = input(retired, Map.of(), 0);
            assertEquals(400, assertThrows(ResponseStatusException.class, () -> admin.save(operator.token, body)).getStatusCode().value());
        }

        var saved = admin.save(operator.token, input(AppearanceService.DEFAULT_STYLE,
            Map.of("pomeranian", AppearanceService.DEFAULT_STYLE), 0));
        assertEquals(AppearanceService.DEFAULT_STYLE, saved.defaultStyle());
        assertEquals(Map.of(), saved.breedStyles());
        assertEquals(List.of(), saved.deletedStyles());
        assertEquals(1, saved.revision());
        assertEquals(1, jdbc.queryForObject("select count(*) from admin_audit where target_type='APPEARANCE'", Integer.class));
    }

    @Test void userCreatedVarietiesAndBreedSelectionsRemainWhileStyleOverridesNormalize() {
        String first = UUID.randomUUID().toString(), second = UUID.randomUUID().toString();
        Map<String, Object> body = input(AppearanceService.DEFAULT_STYLE, Map.of(), 0);
        body.put("deletedStyles", List.of());
        body.put("varieties", List.of(
            variety(first, "pomeranian", "곰돌이형", AppearanceService.DEFAULT_STYLE, "teddy", "patches"),
            variety(second, "shiba", "여우형", null, "fox", "solid")));
        body.put("breedVarieties", Map.of("pomeranian", first, "shiba", second));

        var saved = admin.save(operator.token, body);
        assertEquals(2, saved.varieties().size());
        assertTrue(saved.varieties().stream().allMatch(value -> value.style() == null));
        assertEquals(Map.of("pomeranian", first, "shiba", second), saved.breedVarieties());
        assertEquals(2, jdbc.queryForObject("select count(*) from appearance_varieties", Integer.class));
        assertEquals(2, jdbc.queryForObject("select count(*) from appearance_breed_varieties", Integer.class));
        assertEquals(0, jdbc.queryForObject("select count(*) from appearance_varieties where style is not null", Integer.class));
    }

    @Test void legacyStoredConfigurationIsSafeOnReadAndCleanedOnNextSave() {
        String varietyId = UUID.randomUUID().toString();
        AppearanceSettings legacy = new AppearanceSettings();
        legacy.defaultStyle = "art-16-scenes";
        legacy.breedStyles.put("pomeranian", "sp15-scenes");
        legacy.deletedStyles.add("classic");
        legacy.varieties.add(new AppearanceVariety(new AppearanceService.Variety(varietyId, "pomeranian", "기존 타입",
            "premium-caramel", "original", "solid", "#F0C090", "#FFFFFF")));
        legacy.breedVarieties.put("pomeranian", varietyId);
        legacy.revision = 4;
        settings.saveAndFlush(legacy);

        var safe = appearance.current();
        assertEquals(AppearanceService.DEFAULT_STYLE, safe.defaultStyle());
        assertEquals(Map.of(), safe.breedStyles());
        assertEquals(List.of(), safe.deletedStyles());
        assertNull(safe.varieties().getFirst().style());
        assertEquals(varietyId, safe.breedVarieties().get("pomeranian"));

        Map<String, Object> save = input(AppearanceService.DEFAULT_STYLE, Map.of(), safe.revision());
        save.put("deletedStyles", List.of());
        save.put("varieties", safe.varieties().stream().map(this::variety).toList());
        save.put("breedVarieties", safe.breedVarieties());
        var cleaned = admin.save(operator.token, save);
        assertEquals(5, cleaned.revision());
        assertEquals(0, jdbc.queryForObject("select count(*) from appearance_breed_styles", Integer.class));
        assertEquals(0, jdbc.queryForObject("select count(*) from appearance_deleted_styles", Integer.class));
        assertEquals(0, jdbc.queryForObject("select count(*) from appearance_varieties where style is not null", Integer.class));
    }

    @Test void staleRevisionsAndAttemptsToDeleteRubyAreRejected() {
        var saved = admin.save(operator.token, input(AppearanceService.DEFAULT_STYLE, Map.of(), 0));
        assertEquals(409, assertThrows(ResponseStatusException.class,
            () -> admin.save(operator.token, input(AppearanceService.DEFAULT_STYLE, Map.of(), 0))).getStatusCode().value());
        Map<String, Object> deletion = input(AppearanceService.DEFAULT_STYLE, Map.of(), saved.revision());
        deletion.put("deletedStyles", List.of(AppearanceService.DEFAULT_STYLE));
        assertEquals(400, assertThrows(ResponseStatusException.class,
            () -> admin.save(operator.token, deletion)).getStatusCode().value());
        assertEquals(saved, appearance.current());
    }

    @Test void malformedPayloadsUnknownFieldsAndInvalidVarietiesAreRejectedWithoutMutation() {
        List<Map<String, Object>> malformed = new ArrayList<>();
        malformed.add(new LinkedHashMap<>());
        malformed.add(input("classic", Map.of(), 0));
        malformed.add(input(AppearanceService.DEFAULT_STYLE, Map.of("unknown", AppearanceService.DEFAULT_STYLE), 0));
        Map<String, Object> unexpected = input(AppearanceService.DEFAULT_STYLE, Map.of(), 0);
        unexpected.put("role", "ADMIN"); malformed.add(unexpected);
        Map<String, Object> stringRevision = input(AppearanceService.DEFAULT_STYLE, Map.of(), 0);
        stringRevision.put("expectedRevision", "0"); malformed.add(stringRevision);
        Map<String, Object> badVariety = input(AppearanceService.DEFAULT_STYLE, Map.of(), 0);
        badVariety.put("varieties", List.of(variety("not-a-uuid", "pomeranian", "잘못된 타입", null, "teddy", "solid")));
        badVariety.put("breedVarieties", Map.of()); malformed.add(badVariety);
        Map<String, Object> retiredVariety = input(AppearanceService.DEFAULT_STYLE, Map.of(), 0);
        retiredVariety.put("varieties", List.of(variety(UUID.randomUUID().toString(), "pomeranian", "예전 타입", "art-16", "teddy", "solid")));
        retiredVariety.put("breedVarieties", Map.of()); malformed.add(retiredVariety);

        for (Map<String, Object> body : malformed)
            assertEquals(400, assertThrows(ResponseStatusException.class, () -> admin.save(operator.token, body)).getStatusCode().value());
        assertEquals(new AppearanceService.Config(AppearanceService.DEFAULT_STYLE, Map.of(), 0, null), appearance.current());
        assertEquals(0, settings.count());
        assertEquals(0, jdbc.queryForObject("select count(*) from admin_audit where target_type='APPEARANCE'", Integer.class));
    }

    @Test void missingUnknownAndCoercedJsonFieldsAreRejectedAtomically() throws Exception {
        var original = admin.save(operator.token, input(AppearanceService.DEFAULT_STYLE, Map.of(), 0));
        var invalid = List.of("null", "[]", "{}", "{\"defaultStyle\":\"ruby-round-scenes\",\"breedStyles\":{}}",
            "{\"defaultStyle\":null,\"breedStyles\":{},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"classic\",\"breedStyles\":{},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"ruby-round-scenes\",\"breedStyles\":null,\"expectedRevision\":1}",
            "{\"defaultStyle\":\"ruby-round-scenes\",\"breedStyles\":[],\"expectedRevision\":1}",
            "{\"defaultStyle\":\"ruby-round-scenes\",\"breedStyles\":{\"unknownbreed\":\"ruby-round-scenes\"},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"ruby-round-scenes\",\"breedStyles\":{},\"expectedRevision\":null}",
            "{\"defaultStyle\":\"ruby-round-scenes\",\"breedStyles\":{},\"expectedRevision\":-1}",
            "{\"defaultStyle\":\"ruby-round-scenes\",\"breedStyles\":{},\"expectedRevision\":\"1\"}",
            "{\"defaultStyle\":\"ruby-round-scenes\",\"breedStyles\":{},\"expectedRevision\":1.0}",
            "{\"defaultStyle\":\"ruby-round-scenes\",\"breedStyles\":{},\"expectedRevision\":true}",
            "{\"defaultStyle\":\"ruby-round-scenes\",\"breedStyles\":{},\"expectedRevision\":9007199254740992}",
            "{\"defaultStyle\":\"ruby-round-scenes\",\"breedStyles\":{},\"expectedRevision\":1,\"role\":\"ADMIN\"}");
        for (String body : invalid) {
            assertEquals(400, http("POST", "/api/v1/admin/appearance", operator.token, body).statusCode(), body);
            assertEquals(original, appearance.current());
        }
        assertEquals(1, auditCount());
    }

    @Test void varietyFieldsNormalizeAndLegacyOmissionPreservesUserRecords() {
        var teddy = variety(UUID.randomUUID().toString(), "pomeranian", "  곰돌이형  ", AppearanceService.DEFAULT_STYLE, "teddy", "tuxedo");
        teddy.put("coatColor", "#ab09cf"); teddy.put("patternColor", "#aAbBcC");
        var fox = variety(UUID.randomUUID().toString(), "pomeranian", "여우형", null, "fox", "blaze");
        String teddyId = (String) teddy.get("id");
        var saved = admin.save(operator.token, varieties(0, List.of(teddy, fox), Map.of("pomeranian", teddyId)));
        assertEquals(2, saved.varieties().size());
        assertEquals("곰돌이형", saved.varieties().getFirst().name());
        assertEquals("#AB09CF", saved.varieties().getFirst().coatColor());
        assertEquals("#AABBCC", saved.varieties().getFirst().patternColor());
        assertEquals("teddy", saved.varieties().getFirst().shape());
        assertTrue(saved.varieties().stream().allMatch(value -> value.style() == null));
        assertEquals(Map.of("pomeranian", teddyId), saved.breedVarieties());

        var legacyShape = admin.save(operator.token, input(AppearanceService.DEFAULT_STYLE, Map.of(), saved.revision()));
        assertEquals(saved.varieties(), legacyShape.varieties());
        assertEquals(saved.breedVarieties(), legacyShape.breedVarieties());
        assertEquals(2, jdbc.queryForObject("select count(*) from appearance_varieties", Integer.class));
        assertTrue(jdbc.queryForList("select reason from admin_audit where target_type='APPEARANCE'").stream()
            .anyMatch(row -> row.get("reason").toString().contains("곰돌이형")));
    }

    @Test void pairedVarietyFieldsAndExactObjectShapeAreRequired() {
        var original = admin.save(operator.token, varieties(0,
            List.of(variety(UUID.randomUUID().toString(), "corgi", "양말 무늬", null, "original", "socks")), Map.of()));
        var cases = new ArrayList<Map<String, Object>>();
        var onlyVarieties = input(AppearanceService.DEFAULT_STYLE, Map.of(), 1); onlyVarieties.put("varieties", List.of()); cases.add(onlyVarieties);
        var onlyBindings = input(AppearanceService.DEFAULT_STYLE, Map.of(), 1); onlyBindings.put("breedVarieties", Map.of()); cases.add(onlyBindings);
        for (String missing : List.of("id", "breed", "name", "style", "shape", "pattern", "coatColor", "patternColor")) {
            var value = variety(UUID.randomUUID().toString(), "corgi", "세부 타입", null, "original", "solid");
            value.remove(missing); cases.add(varieties(1, List.of(value), Map.of()));
        }
        var unknown = variety(UUID.randomUUID().toString(), "corgi", "세부 타입", null, "original", "solid");
        unknown.put("hidden", true); cases.add(varieties(1, List.of(unknown), Map.of()));
        for (var body : cases) {
            assertEquals(400, assertThrows(ResponseStatusException.class, () -> admin.save(operator.token, body)).getStatusCode().value());
            assertEquals(original, appearance.current());
        }
    }

    @Test void varietyIdentityBreedNameColorShapePatternAndStyleAreBounded() {
        var invalidFields = new LinkedHashMap<String, List<Object>>();
        invalidFields.put("id", Arrays.asList(null, "", "1-1-1-1-1", UUID.randomUUID().toString().toUpperCase(Locale.ROOT)));
        invalidFields.put("breed", Arrays.asList(null, "unknownbreed", "POMERANIAN"));
        invalidFields.put("name", Arrays.asList(null, "", " \u00a0 ", "긴".repeat(25), "곰\n돌이", "숨김\u200B이름", 7));
        invalidFields.put("style", List.of("classic", "art-16-scenes", 2));
        invalidFields.put("shape", Arrays.asList(null, "bear", "Teddy", 1));
        invalidFields.put("pattern", Arrays.asList(null, "stripe", "Solid"));
        invalidFields.put("coatColor", List.of("red", "#FFF", "#FFFFFF00", 1));
        invalidFields.put("patternColor", Arrays.asList(null, "red", "#ffffff00", "#GGHHJJ", 1));
        for (var field : invalidFields.entrySet()) for (Object invalid : field.getValue()) {
            var value = variety(UUID.randomUUID().toString(), "pomeranian", "정상 이름", null, "original", "solid");
            value.put(field.getKey(), invalid);
            assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> admin.save(operator.token, varieties(0, List.of(value), Map.of()))).getStatusCode().value());
            assertEquals(0, appearance.current().revision());
        }
        for (String shape : AppearanceService.SHAPES) for (String pattern : AppearanceService.PATTERNS) {
            var value = variety(UUID.randomUUID().toString(), "pomeranian", "🐶".repeat(24), null, shape, pattern);
            var saved = admin.save(operator.token, varieties(appearance.current().revision(), List.of(value), Map.of()));
            assertEquals(shape, saved.varieties().getFirst().shape());
            assertEquals(pattern, saved.varieties().getFirst().pattern());
        }
    }

    @Test void duplicateIdsNamesAndCrossBreedSelectionsAreRejected() {
        var first = variety(UUID.randomUUID().toString(), "pomeranian", "Teddy  Cut", null, "original", "solid");
        var second = variety(UUID.randomUUID().toString(), "pomeranian", " teddy\u00a0cut ", null, "original", "solid");
        rejected(400, () -> admin.save(operator.token, varieties(0, List.of(first, second), Map.of())));
        second.put("name", "다른 이름"); second.put("id", first.get("id"));
        rejected(400, () -> admin.save(operator.token, varieties(0, List.of(first, second), Map.of())));
        rejected(400, () -> admin.save(operator.token, varieties(0, List.of(first), Map.of("poodle", (String) first.get("id")))));
        rejected(400, () -> admin.save(operator.token, varieties(0, List.of(first), Map.of("pomeranian", UUID.randomUUID().toString()))));
        var otherBreed = variety(UUID.randomUUID().toString(), "poodle", "Teddy Cut", null, "original", "solid");
        assertEquals(2, admin.save(operator.token, varieties(0, List.of(first, otherBreed), Map.of())).varieties().size());
    }

    @Test void varietyLimitsAuditBoundsAndThirtyBreedBindingsArePreserved() {
        var all = new ArrayList<Map<String, Object>>();
        var active = new LinkedHashMap<String, String>();
        for (String breed : AppearanceService.BREEDS.subList(0, 7)) for (int index = 0; index < 20; index++) {
            var value = variety(UUID.randomUUID().toString(), breed, "🐶".repeat(20) + index, null, "original", "solid");
            all.add(value); active.put(breed, (String) value.get("id"));
        }
        var overflow = new ArrayList<>(all); overflow.add(variety(UUID.randomUUID().toString(), "pomeranian", "추가", null, "original", "solid"));
        rejected(400, () -> admin.save(operator.token, varieties(0, overflow, active)));
        var perBreed = new ArrayList<>(all.subList(0, 20));
        perBreed.add(variety(UUID.randomUUID().toString(), AppearanceService.BREEDS.getFirst(), "추가", null, "original", "solid"));
        rejected(400, () -> admin.save(operator.token, varieties(0, perBreed, Map.of())));
        var saved = admin.save(operator.token, varieties(0, all, active));
        assertEquals(140, saved.varieties().size()); assertEquals(7, saved.breedVarieties().size());
        String reason = jdbc.queryForObject("select reason from admin_audit where target_type='APPEARANCE'", String.class);
        assertTrue(reason.length() <= 600); assertTrue(reason.contains("140개"));

        settings.deleteAll(); jdbc.update("delete from admin_audit where target_type='APPEARANCE'");
        var onePerBreed = new ArrayList<Map<String, Object>>(); var bindings = new LinkedHashMap<String, String>();
        for (String breed : AppearanceService.BREEDS) {
            var value = variety(UUID.randomUUID().toString(), breed, "기본 타입", null, "original", "patches");
            onePerBreed.add(value); bindings.put(breed, (String) value.get("id"));
        }
        var aligned = admin.save(operator.token, varieties(0, onePerBreed, bindings));
        assertEquals(30, AppearanceService.BREEDS.size()); assertEquals(30, aligned.varieties().size()); assertEquals(30, aligned.breedVarieties().size());
        assertEquals(30, jdbc.queryForObject("select count(*) from appearance_breed_varieties", Integer.class));
    }

    @Test void concurrentWritesHaveOneWinnerAndOneRevisionConflict() throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Integer>> attempts = new ArrayList<>();
            for (int index = 0; index < 2; index++) attempts.add(pool.submit(() -> {
                start.await();
                try { admin.save(operator.token, input(AppearanceService.DEFAULT_STYLE, Map.of(), 0)); return 200; }
                catch (ResponseStatusException error) { return error.getStatusCode().value(); }
            }));
            start.countDown();
            assertEquals(Set.of(200, 409), Set.of(attempts.get(0).get(15, TimeUnit.SECONDS), attempts.get(1).get(15, TimeUnit.SECONDS)));
        }
        assertEquals(1, appearance.current().revision());
        assertEquals(1, settings.count());
        assertEquals(1, jdbc.queryForObject("select count(*) from admin_audit where target_type='APPEARANCE'", Integer.class));
    }

    @Test void onlyActiveVerifiedAdministratorsCanReadOrWriteAdminAppearance() throws Exception {
        var member = account(Account.Role.USER, true, Account.Status.ACTIVE);
        var unverified = account(Account.Role.ADMIN, false, Account.Status.ACTIVE);
        var suspended = account(Account.Role.ADMIN, true, Account.Status.SUSPENDED);
        for (String token : Arrays.asList(null, "invalid", member.token, unverified.token, suspended.token)) {
            int expected = token == null || token.equals("invalid") ? 401 : 403;
            assertEquals(expected, http("GET", "/api/v1/admin/appearance", token, null).statusCode());
            assertEquals(expected, http("POST", "/api/v1/admin/appearance", token,
                mapper.writeValueAsString(input(AppearanceService.DEFAULT_STYLE, Map.of(), 0))).statusCode());
            assertEquals(200, http("GET", "/api/v1/appearance", token, null).statusCode());
        }
        assertEquals(0, settings.count());
    }

    private Map<String, Object> input(String style, Map<String, String> breeds, long revision) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("defaultStyle", style); body.put("breedStyles", breeds); body.put("expectedRevision", revision);
        return body;
    }

    private Map<String, Object> variety(String id, String breed, String name, String style, String shape, String pattern) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("id", id); value.put("breed", breed); value.put("name", name); value.put("style", style);
        value.put("shape", shape); value.put("pattern", pattern); value.put("coatColor", null); value.put("patternColor", "#FFFFFF");
        return value;
    }

    private Map<String, Object> variety(AppearanceService.Variety source) {
        Map<String, Object> value = variety(source.id(), source.breed(), source.name(), source.style(), source.shape(), source.pattern());
        value.put("coatColor", source.coatColor()); value.put("patternColor", source.patternColor());
        return value;
    }

    private Map<String, Object> varieties(long revision, List<Map<String, Object>> values, Map<String, String> active) {
        Map<String, Object> body = input(AppearanceService.DEFAULT_STYLE, Map.of(), revision);
        body.put("deletedStyles", List.of()); body.put("varieties", values); body.put("breedVarieties", active);
        return body;
    }

    private long auditCount() {
        return jdbc.queryForObject("select count(*) from admin_audit where target_type='APPEARANCE'", Long.class);
    }

    private void rejected(int status, Runnable action) {
        assertEquals(status, assertThrows(ResponseStatusException.class, action::run).getStatusCode().value());
    }

    private Identity account(Account.Role role, boolean verified, Account.Status status) {
        var registration = auth.register(UUID.randomUUID().toString(), new AuthService.Register(
            UUID.randomUUID() + "@appearance.test", "Appearance-Test!2026", "스타일 검증"));
        Account account = accounts.findById(registration.user().id()).orElseThrow();
        account.role = role; account.emailVerified = verified; account.status = status;
        accounts.save(account);
        return new Identity(account, registration.token());
    }

    private HttpResponse<String> http(String method, String path, String token, String body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(10));
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        if (token != null) request.header("X-Session-Token", token);
        if (body != null) request.header("Content-Type", "application/json");
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
}
