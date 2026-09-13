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
    Map<String, Object> input(String style, Map<String, String> breeds, long revision, List<String> deletedStyles) {
        return Map.of("defaultStyle", style, "breedStyles", breeds, "expectedRevision", revision, "deletedStyles", deletedStyles);
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
        assertEquals(Set.of("defaultStyle", "breedStyles", "revision", "updatedAt", "deletedStyles", "varieties", "breedVarieties"), body.keySet());
        assertEquals("classic", body.get("defaultStyle"));
        assertEquals(Map.of(), body.get("breedStyles"));
        assertEquals(List.of(), body.get("deletedStyles"));
        assertEquals(List.of(), body.get("varieties")); assertEquals(Map.of(), body.get("breedVarieties"));
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
        assertEquals(AppearanceService.STYLES.size(), revision); assertEquals(AppearanceService.STYLES.size(), auditCount());
        assertEquals(113, new HashSet<>(AppearanceService.STYLES).size()); assertTrue(AppearanceService.STYLES.contains("meadow"));
        assertEquals("animated-2d", AppearanceService.STYLES.getLast());
    }

    @Test void deletionsPersistAndLegacySavePreservesThemUntilAnExplicitRestore() throws Exception {
        var removed = admin.save(operator.token, input("round", Map.of("poodle", "soft"), 0, List.of("badge", "classic", "retro")));
        assertEquals(List.of("classic", "retro", "badge"), removed.deletedStyles());
        assertEquals(removed, mapper.readValue(http("GET", "/api/v1/appearance", null, null).body(), AppearanceService.Config.class));
        assertEquals(removed, admin.current(operator.token));
        var legacy = admin.save(operator.token, input("mochi", Map.of("shiba", "cookie"), removed.revision()));
        assertEquals(removed.deletedStyles(), legacy.deletedStyles());
        assertEquals(2, legacy.revision());
        // The existing three-argument internal contract also means preserve rather than restore.
        var directLegacy = appearance.update(new AppearanceService.Input("mochi", Map.of(), legacy.revision()));
        assertEquals(removed.deletedStyles(), directLegacy.deletedStyles());
        var restored = admin.save(operator.token, input("classic", Map.of("poodle", "badge"), directLegacy.revision(), List.of()));
        assertEquals(List.of(), restored.deletedStyles()); assertEquals("classic", restored.defaultStyle());
        assertEquals("badge", restored.breedStyles().get("poodle")); assertEquals(4, restored.revision());
        assertEquals(restored, appearance.current());
        assertEquals(3, auditCount()); // Direct internal compatibility call intentionally has no administrator audit.
        assertTrue(jdbc.queryForList("select reason from admin_audit where target_type='APPEARANCE'").stream()
            .anyMatch(row -> row.get("reason").toString().contains("삭제 [classic, retro, badge]")));
    }

    @Test void deletingReferencedStylesAndLegacyAttemptsToReuseDeletedStylesAreRejectedAtomically() {
        var original = admin.save(operator.token, input("round", Map.of("poodle", "fluffy"), 0));
        rejected(400, () -> admin.save(operator.token, input("round", Map.of("poodle", "fluffy"), original.revision(), List.of("round"))));
        rejected(400, () -> admin.save(operator.token, input("round", Map.of("poodle", "fluffy"), original.revision(), List.of("fluffy"))));
        assertEquals(original, appearance.current()); assertEquals(1, auditCount());
        var removed = admin.save(operator.token, input("mochi", Map.of(), original.revision(), List.of("round", "fluffy")));
        rejected(400, () -> admin.save(operator.token, input("round", Map.of(), removed.revision())));
        rejected(400, () -> admin.save(operator.token, input("mochi", Map.of("poodle", "fluffy"), removed.revision())));
        assertEquals(removed, appearance.current()); assertEquals(2, auditCount());
        rejected(409, () -> admin.save(operator.token, input("round", Map.of(), original.revision(), List.of())));
        assertEquals(removed, appearance.current()); assertEquals(2, auditCount());
    }

    @Test void invalidDeletionListsAreRejectedAndAtLeastOneStyleMustRemain() throws Exception {
        for (Object invalid : Arrays.asList(null, "round", 1, Map.of(), List.of("unknown"), List.of("round", "round"),
            List.of(1), Arrays.asList("round", null), AppearanceService.STYLES)) {
            Map<String, Object> body = new LinkedHashMap<>(input("classic", Map.of(), 0)); body.put("deletedStyles", invalid);
            assertEquals(400, http("POST", "/api/v1/admin/appearance", operator.token, mapper.writeValueAsString(body)).statusCode());
            assertEquals(new AppearanceService.Config("classic", Map.of(), 0, null), appearance.current());
        }
        var deleted = AppearanceService.STYLES.stream().filter(style -> !style.equals("badge")).toList();
        var last = admin.save(operator.token, input("badge", Map.of("shiba", "badge"), 0, deleted));
        assertEquals(AppearanceService.STYLES.size() - 1, last.deletedStyles().size()); assertEquals("badge", last.defaultStyle());
        rejected(400, () -> admin.save(operator.token, input("badge", Map.of(), last.revision(), AppearanceService.STYLES)));
        assertEquals(last, appearance.current()); assertEquals(1, auditCount());
        var restored = admin.save(operator.token, input("classic", Map.of(), last.revision(), List.of()));
        assertTrue(restored.deletedStyles().isEmpty());
    }

    @Test void unauthorizedClientsCannotDeleteOrRestoreStyles() throws Exception {
        var saved = admin.save(operator.token, input("round", Map.of(), 0, List.of("classic")));
        var member = account(Account.Role.USER, true, Account.Status.ACTIVE);
        var unverified = account(Account.Role.ADMIN, false, Account.Status.ACTIVE);
        var suspended = account(Account.Role.ADMIN, true, Account.Status.SUSPENDED);
        for (String token : Arrays.asList(null, member.token, unverified.token, suspended.token)) {
            int expected = token == null ? 401 : 403;
            for (List<String> deleted : List.of(List.<String>of(), List.of("classic", "badge"))) {
                assertEquals(expected, http("POST", "/api/v1/admin/appearance", token,
                    mapper.writeValueAsString(input("round", Map.of(), saved.revision(), deleted))).statusCode());
            }
        }
        assertEquals(saved, appearance.current()); assertEquals(1, auditCount());
    }

    @Test void malformedMissingUnknownAndCoercedInputsAreRejectedWithoutChanges() throws Exception {
        var original = admin.save(operator.token, input("round", Map.of("beagle", "badge"), 0));
        var invalid = List.of("null", "[]", "{}", "{\"defaultStyle\":\"classic\",\"breedStyles\":{}}",
            "{\"defaultStyle\":null,\"breedStyles\":{},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"unknown\",\"breedStyles\":{},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"ROUND\",\"breedStyles\":{},\"expectedRevision\":1}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":null,\"expectedRevision\":1}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":[],\"expectedRevision\":1}",
            "{\"defaultStyle\":\"round\",\"breedStyles\":{\"unknownbreed\":\"classic\"},\"expectedRevision\":1}",
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

    Map<String, Object> variety(String breed, String name) {
        var value = new LinkedHashMap<String, Object>();
        value.put("id", UUID.randomUUID().toString()); value.put("breed", breed); value.put("name", name); value.put("style", null);
        value.put("shape", "original"); value.put("pattern", "solid"); value.put("coatColor", null); value.put("patternColor", "#FFFFFF");
        return value;
    }
    Map<String, Object> varieties(long revision, List<Map<String, Object>> varieties, Map<String, String> active) {
        var body = new LinkedHashMap<String, Object>(input("classic", Map.of("poodle", "fluffy"), revision, List.of()));
        body.put("varieties", varieties); body.put("breedVarieties", active); return body;
    }

    @Test void varietiesSaveTypedFieldsAndSelectionAtomicallyAndLegacyOmissionPreservesThem() throws Exception {
        var teddy = variety("pomeranian", "  곰돌이형  "); teddy.put("shape", "teddy"); teddy.put("pattern", "tuxedo");
        teddy.put("style", "animated-2d"); teddy.put("coatColor", "#ab09cf"); teddy.put("patternColor", "#aAbBcC");
        var fox = variety("pomeranian", "여우형"); fox.put("shape", "fox"); fox.put("pattern", "blaze");
        String teddyId = (String)teddy.get("id"); var selected = Map.of("pomeranian", teddyId);
        var saved = admin.save(operator.token, varieties(0, List.of(teddy, fox), selected));
        assertEquals(2, saved.varieties().size()); assertEquals(selected, saved.breedVarieties());
        assertEquals("곰돌이형", saved.varieties().getFirst().name()); assertEquals("#AB09CF", saved.varieties().getFirst().coatColor());
        assertEquals("#AABBCC", saved.varieties().getFirst().patternColor()); assertNull(saved.varieties().getLast().style());
        assertEquals("animated-2d", saved.varieties().getFirst().style()); assertEquals("teddy", saved.varieties().getFirst().shape());
        assertEquals(saved, mapper.readValue(http("GET", "/api/v1/appearance", null, null).body(), AppearanceService.Config.class));
        assertEquals(2, jdbc.queryForObject("select count(*) from appearance_varieties", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from appearance_breed_varieties", Integer.class));
        var legacy = admin.save(operator.token, input("round", Map.of(), saved.revision()));
        assertEquals(saved.varieties(), legacy.varieties()); assertEquals(selected, legacy.breedVarieties());
        var direct = appearance.update(new AppearanceService.Input("round", Map.of(), legacy.revision(), List.of("retro")));
        assertEquals(saved.varieties(), direct.varieties()); assertEquals(selected, direct.breedVarieties());
        rejected(409, () -> admin.save(operator.token, varieties(saved.revision(), List.of(), Map.of())));
        assertEquals(direct, appearance.current());
        var reversed = admin.save(operator.token, varieties(direct.revision(), List.of(fox, teddy), selected));
        assertEquals("여우형", reversed.varieties().getFirst().name());
        var removed = admin.save(operator.token, varieties(reversed.revision(), List.of(), Map.of()));
        assertTrue(removed.varieties().isEmpty()); assertTrue(removed.breedVarieties().isEmpty());
        assertEquals(0, jdbc.queryForObject("select count(*) from appearance_varieties", Integer.class));
        assertTrue(jdbc.queryForList("select reason from admin_audit where target_type='APPEARANCE'").stream()
            .anyMatch(row -> row.get("reason").toString().contains("곰돌이형")));
    }

    @Test void pairedFieldsExactVarietyShapeAndMalformedTypesAreRejected() throws Exception {
        var original = admin.save(operator.token, varieties(0, List.of(variety("corgi", "양말 무늬")), Map.of()));
        var cases = new ArrayList<Map<String, Object>>();
        var onlyVarieties = new LinkedHashMap<String, Object>(input("classic", Map.of(), 1)); onlyVarieties.put("varieties", List.of()); cases.add(onlyVarieties);
        var onlySelection = new LinkedHashMap<String, Object>(input("classic", Map.of(), 1)); onlySelection.put("breedVarieties", Map.of()); cases.add(onlySelection);
        for (Object invalid : Arrays.asList(null, Map.of(), "list", List.of(1), Arrays.asList((Object)null))) {
            var body = varieties(1, List.of(), Map.of()); body.put("varieties", invalid); cases.add(body);
        }
        for (Object invalid : Arrays.asList(null, List.of(), "map", Map.of("corgi", 1))) {
            var body = varieties(1, List.of(), Map.of()); body.put("breedVarieties", invalid); cases.add(body);
        }
        for (String missing : List.of("id", "breed", "name", "style", "shape", "pattern", "coatColor", "patternColor")) {
            var value = variety("corgi", "세부 타입"); value.remove(missing); cases.add(varieties(1, List.of(value), Map.of()));
        }
        var unknown = variety("corgi", "세부 타입"); unknown.put("hidden", true); cases.add(varieties(1, List.of(unknown), Map.of()));
        for (var body : cases) {
            assertEquals(400, http("POST", "/api/v1/admin/appearance", operator.token, mapper.writeValueAsString(body)).statusCode());
            assertEquals(original, appearance.current());
        }
        assertEquals(1, auditCount());
    }

    @Test void varietyIdentityBreedNameColorShapePatternAndStyleAreValidated() {
        var invalidFields = new LinkedHashMap<String, List<Object>>();
        invalidFields.put("id", Arrays.asList(null, "", "1-1-1-1-1", UUID.randomUUID().toString().toUpperCase(Locale.ROOT)));
        invalidFields.put("breed", Arrays.asList(null, "unknownbreed", "POMERANIAN"));
        invalidFields.put("name", Arrays.asList(null, "", " \u00a0 ", "긴".repeat(25), "곰\n돌이", "숨김\u200B이름", 7));
        invalidFields.put("style", List.of("unlisted", 2)); invalidFields.put("shape", Arrays.asList(null, "bear", "Teddy", 1));
        invalidFields.put("pattern", Arrays.asList(null, "stripe", "Solid"));
        invalidFields.put("coatColor", List.of("red", "#FFF", "#FFFFFF00", 1));
        invalidFields.put("patternColor", Arrays.asList(null, "red", "#ffffff00", "#GGHHJJ", 1));
        for (var field : invalidFields.entrySet()) for (Object invalid : field.getValue()) {
            var value = variety("pomeranian", "정상 이름"); value.put(field.getKey(), invalid);
            rejected(400, () -> admin.save(operator.token, varieties(0, List.of(value), Map.of())));
            assertEquals(0, appearance.current().revision());
        }
        for (String shape : AppearanceService.SHAPES) for (String pattern : AppearanceService.PATTERNS) {
            var value = variety("pomeranian", "🐶".repeat(24)); value.put("shape", shape); value.put("pattern", pattern);
            var saved = admin.save(operator.token, varieties(appearance.current().revision(), List.of(value), Map.of()));
            assertEquals(shape, saved.varieties().getFirst().shape()); assertEquals(pattern, saved.varieties().getFirst().pattern());
        }
    }

    @Test void duplicateIdsNamesAndCrossBreedSelectionsAreRejected() {
        var first = variety("pomeranian", "Teddy  Cut"); var second = variety("pomeranian", " teddy\u00a0cut ");
        rejected(400, () -> admin.save(operator.token, varieties(0, List.of(first, second), Map.of())));
        second.put("name", "다른 이름"); second.put("id", first.get("id"));
        rejected(400, () -> admin.save(operator.token, varieties(0, List.of(first, second), Map.of())));
        rejected(400, () -> admin.save(operator.token, varieties(0, List.of(first), Map.of("poodle", (String)first.get("id")))));
        rejected(400, () -> admin.save(operator.token, varieties(0, List.of(first), Map.of("husky", (String)first.get("id")))));
        rejected(400, () -> admin.save(operator.token, varieties(0, List.of(first), Map.of("pomeranian", UUID.randomUUID().toString()))));
        var otherBreed = variety("poodle", "Teddy Cut");
        assertEquals(2, admin.save(operator.token, varieties(0, List.of(first, otherBreed), Map.of())).varieties().size());
    }

    @Test void usedVarietyStyleCannotBeDeletedByLegacyOrNewClientAndExplicitInheritanceAllowsDeletion() {
        var value = variety("pomeranian", "곰돌이형"); value.put("style", "teddy");
        var saved = admin.save(operator.token, varieties(0, List.of(value), Map.of("pomeranian", (String)value.get("id"))));
        rejected(400, () -> admin.save(operator.token, input("classic", Map.of(), saved.revision(), List.of("teddy"))));
        var deleted = varieties(saved.revision(), List.of(value), saved.breedVarieties()); deleted.put("deletedStyles", List.of("teddy"));
        rejected(400, () -> admin.save(operator.token, deleted)); assertEquals(saved, appearance.current()); assertEquals(1, auditCount());
        value.put("style", null);
        var inherited = admin.save(operator.token, deleted);
        assertNull(inherited.varieties().getFirst().style()); assertEquals(List.of("teddy"), inherited.deletedStyles());
        assertEquals(saved.breedVarieties(), inherited.breedVarieties());
    }

    @Test void meadowCanBeAppliedToGlobalBreedAndVarietyWhileLegacySettingsAndDeletionRulesStayIntact() throws Exception {
        var original = admin.save(operator.token, input("round", Map.of("poodle", "fluffy"), 0, List.of("classic")));
        assertEquals(original, appearance.current()); // Adding the catalog entry does not choose it for an existing owner.
        var puppy = variety("samoyed", "풀밭 친구"); puppy.put("style", "meadow");
        var body = varieties(original.revision(), List.of(puppy), Map.of("samoyed", (String)puppy.get("id")));
        body.put("defaultStyle", "meadow"); body.put("breedStyles", Map.of("poodle", "fluffy", "samoyed", "meadow"));
        body.put("deletedStyles", original.deletedStyles());
        var response = http("POST", "/api/v1/admin/appearance", operator.token, mapper.writeValueAsString(body));
        assertEquals(200, response.statusCode());
        var saved = mapper.readValue(response.body(), AppearanceService.Config.class);
        assertEquals("meadow", saved.defaultStyle()); assertEquals("meadow", saved.breedStyles().get("samoyed"));
        assertEquals("meadow", saved.varieties().getFirst().style()); assertEquals("fluffy", saved.breedStyles().get("poodle"));
        assertEquals(original.deletedStyles(), saved.deletedStyles());
        assertEquals(saved, mapper.readValue(http("GET", "/api/v1/appearance", null, null).body(), AppearanceService.Config.class));

        var legacy = admin.save(operator.token, input("meadow", saved.breedStyles(), saved.revision()));
        assertEquals(saved.varieties(), legacy.varieties()); assertEquals(saved.breedVarieties(), legacy.breedVarieties());
        assertEquals(saved.deletedStyles(), legacy.deletedStyles());
        rejected(400, () -> admin.save(operator.token, input("round", Map.of("poodle", "fluffy"), legacy.revision(), List.of("classic", "meadow"))));
        assertEquals(legacy, appearance.current()); assertEquals(3, auditCount());

        puppy.put("style", null);
        var deletion = varieties(legacy.revision(), List.of(puppy), legacy.breedVarieties());
        deletion.put("defaultStyle", "round"); deletion.put("breedStyles", Map.of("poodle", "fluffy"));
        deletion.put("deletedStyles", List.of("classic", "meadow"));
        var deleted = admin.save(operator.token, deletion);
        assertEquals(List.of("classic", "meadow"), deleted.deletedStyles()); assertNull(deleted.varieties().getFirst().style());
        assertEquals(legacy.breedVarieties(), deleted.breedVarieties());
        rejected(400, () -> admin.save(operator.token, input("meadow", Map.of(), deleted.revision())));
        assertEquals(deleted, appearance.current()); assertEquals(4, auditCount());
    }

    @Test void sixteenCuteStylesRoundTripInVarietiesAndRespectExistingSettingsAndDeletionRules() throws Exception {
        var cute = List.of("cozy-chubby", "cozy-slim", "cozy-tall", "cozy-loaf", "bean-chubby", "bean-slim", "bean-tall", "bean-loaf",
            "bright-chubby", "bright-slim", "bright-tall", "bright-loaf", "button-chubby", "button-slim", "button-tall", "button-loaf");
        assertTrue(cute.stream().allMatch(id -> id.length() <= 24));
        var original = admin.save(operator.token, input("round", Map.of("samoyed", "meadow"), 0, List.of("retro")));
        assertEquals(original, appearance.current()); // Extending the catalog never changes an existing selection.
        var types = new ArrayList<Map<String, Object>>();
        for (String id : cute) {
            var type = variety("pomeranian", id); type.put("style", id); types.add(type);
        }
        var body = varieties(original.revision(), types, Map.of("pomeranian", (String)types.getFirst().get("id")));
        body.put("defaultStyle", "cozy-chubby"); body.put("breedStyles", Map.of("pomeranian", "bean-slim", "samoyed", "meadow"));
        body.put("deletedStyles", original.deletedStyles());
        var response = http("POST", "/api/v1/admin/appearance", operator.token, mapper.writeValueAsString(body));
        assertEquals(200, response.statusCode());
        var saved = mapper.readValue(response.body(), AppearanceService.Config.class);
        assertEquals(cute, saved.varieties().stream().map(AppearanceService.Variety::style).toList());
        assertEquals("cozy-chubby", saved.defaultStyle()); assertEquals("bean-slim", saved.breedStyles().get("pomeranian"));
        assertEquals("meadow", saved.breedStyles().get("samoyed")); assertEquals(original.deletedStyles(), saved.deletedStyles());
        assertEquals(saved, mapper.readValue(http("GET", "/api/v1/appearance", null, null).body(), AppearanceService.Config.class));
        var legacy = admin.save(operator.token, input(saved.defaultStyle(), saved.breedStyles(), saved.revision()));
        assertEquals(saved.varieties(), legacy.varieties()); assertEquals(saved.breedVarieties(), legacy.breedVarieties());
        assertEquals(saved.deletedStyles(), legacy.deletedStyles());
        rejected(400, () -> admin.save(operator.token, input("round", Map.of(), legacy.revision(), List.of("retro", "button-loaf"))));
        assertEquals(legacy, appearance.current());
        var deletedIds = new ArrayList<>(List.of("retro")); deletedIds.addAll(cute);
        var remove = varieties(legacy.revision(), List.of(), Map.of());
        remove.put("defaultStyle", "round"); remove.put("breedStyles", Map.of("samoyed", "meadow")); remove.put("deletedStyles", deletedIds);
        var removed = admin.save(operator.token, remove);
        assertEquals(deletedIds, removed.deletedStyles()); assertTrue(removed.varieties().isEmpty());
        rejected(400, () -> admin.save(operator.token, input("cozy-chubby", Map.of(), removed.revision())));
        assertEquals(removed, appearance.current());
        var restored = admin.save(operator.token, input("button-tall", Map.of("pomeranian", "bright-slim"), removed.revision(), List.of("retro")));
        assertEquals("button-tall", restored.defaultStyle()); assertEquals(List.of("retro"), restored.deletedStyles());
        assertEquals(5, auditCount());
    }

    @Test void twelvePremiumStylesPreserveCuratedDeletionsAndRoundTripThroughEveryAssignmentLevel() throws Exception {
        var premium = List.of("premium-marshmallow", "premium-milkbean", "premium-honeybun", "premium-cloudpuff", "premium-biscuit", "premium-naploaf",
            "premium-teddycub", "premium-peachcheek", "premium-buttonpaw", "premium-rounddrop", "premium-cottonball", "premium-caramel");
        assertTrue(premium.stream().allMatch(id -> id.length() <= 24));
        var retained = Set.of("classic", "bean", "mini", "soft", "fluffy", "cozy-chubby", "cozy-loaf", "bean-chubby", "bean-loaf", "button-chubby");
        var deleted = AppearanceService.STYLES.stream().filter(id -> !retained.contains(id) && !premium.contains(id)).toList();
        var original = admin.save(operator.token, input("classic", Map.of("poodle", "fluffy"), 0, deleted));
        assertEquals(original, appearance.current());
        var types = new ArrayList<Map<String, Object>>();
        for (String id : premium) { var type = variety("pomeranian", id); type.put("style", id); types.add(type); }
        var body = varieties(original.revision(), types, Map.of("pomeranian", (String) types.getFirst().get("id")));
        body.put("defaultStyle", premium.getFirst()); body.put("breedStyles", Map.of("pomeranian", "premium-caramel", "poodle", "fluffy"));
        body.put("deletedStyles", deleted);
        var response = http("POST", "/api/v1/admin/appearance", operator.token, mapper.writeValueAsString(body));
        assertEquals(200, response.statusCode());
        var saved = mapper.readValue(response.body(), AppearanceService.Config.class);
        assertEquals(premium, saved.varieties().stream().map(AppearanceService.Variety::style).toList());
        assertEquals(premium.getFirst(), saved.defaultStyle()); assertEquals("premium-caramel", saved.breedStyles().get("pomeranian"));
        assertEquals("fluffy", saved.breedStyles().get("poodle")); assertEquals(deleted, saved.deletedStyles());
        assertEquals(saved, mapper.readValue(http("GET", "/api/v1/appearance", null, null).body(), AppearanceService.Config.class));
        var legacy = admin.save(operator.token, input(saved.defaultStyle(), saved.breedStyles(), saved.revision()));
        assertEquals(saved.varieties(), legacy.varieties()); assertEquals(saved.breedVarieties(), legacy.breedVarieties());
        assertEquals(deleted, legacy.deletedStyles());
        var removingActive = new ArrayList<>(deleted); removingActive.add("premium-caramel");
        rejected(400, () -> admin.save(operator.token, input("classic", Map.of(), legacy.revision(), removingActive)));
        assertEquals(legacy, appearance.current());
        var allDeleted = new HashSet<>(deleted); allDeleted.addAll(premium);
        var remove = varieties(legacy.revision(), List.of(), Map.of());
        remove.put("defaultStyle", "classic"); remove.put("breedStyles", Map.of("poodle", "fluffy"));
        remove.put("deletedStyles", AppearanceService.STYLES.stream().filter(allDeleted::contains).toList());
        var removed = admin.save(operator.token, remove);
        assertTrue(removed.deletedStyles().containsAll(premium)); assertTrue(removed.deletedStyles().containsAll(deleted));
        rejected(400, () -> admin.save(operator.token, input("premium-milkbean", Map.of(), removed.revision())));
        assertEquals(removed, appearance.current()); assertEquals(4, auditCount());
    }

    @Test void thirtyOriginalArtStylesCanBeAssignedAndRemovedWithoutRestoringCuratedStyles() throws Exception {
        var art = java.util.stream.IntStream.rangeClosed(1, 30).mapToObj(i -> "art-%02d".formatted(i)).toList();
        assertEquals(113, AppearanceService.STYLES.size());
        assertTrue(AppearanceService.STYLES.containsAll(art));
        var deleted = List.of("round", "mochi", "chibi", "retro", "premium-milkbean");
        var original = admin.save(operator.token, input("classic", Map.of("maltese", "soft"), 0, deleted));
        assertEquals(original, appearance.current());
        var types = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < art.size(); i++) {
            var type = variety(i < 15 ? "pomeranian" : "poodle", art.get(i)); type.put("style", art.get(i)); types.add(type);
        }
        var body = varieties(original.revision(), types, Map.of("pomeranian", (String) types.getFirst().get("id"), "poodle", (String) types.getLast().get("id")));
        body.put("defaultStyle", "art-01"); body.put("breedStyles", Map.of("pomeranian", "art-15", "poodle", "art-30", "maltese", "soft"));
        body.put("deletedStyles", deleted);
        var response = http("POST", "/api/v1/admin/appearance", operator.token, mapper.writeValueAsString(body));
        assertEquals(200, response.statusCode());
        var saved = mapper.readValue(response.body(), AppearanceService.Config.class);
        assertEquals("art-01", saved.defaultStyle()); assertEquals("art-15", saved.breedStyles().get("pomeranian"));
        assertEquals("art-30", saved.breedStyles().get("poodle")); assertEquals("soft", saved.breedStyles().get("maltese"));
        assertEquals(art, saved.varieties().stream().map(AppearanceService.Variety::style).toList()); assertEquals(deleted, saved.deletedStyles());
        assertEquals(saved, mapper.readValue(http("GET", "/api/v1/appearance", null, null).body(), AppearanceService.Config.class));
        var legacy = admin.save(operator.token, input(saved.defaultStyle(), saved.breedStyles(), saved.revision()));
        assertEquals(saved.varieties(), legacy.varieties()); assertEquals(saved.breedVarieties(), legacy.breedVarieties()); assertEquals(deleted, legacy.deletedStyles());
        var forbidden = new ArrayList<>(deleted); forbidden.add("art-30");
        rejected(400, () -> admin.save(operator.token, input("classic", Map.of(), legacy.revision(), forbidden)));
        rejected(400, () -> admin.save(operator.token, input("art-31", Map.of(), legacy.revision())));
        assertEquals(legacy, appearance.current());
        var allDeleted = new HashSet<>(deleted); allDeleted.addAll(art);
        var remove = varieties(legacy.revision(), List.of(), Map.of());
        remove.put("defaultStyle", "classic"); remove.put("breedStyles", Map.of("maltese", "soft"));
        remove.put("deletedStyles", AppearanceService.STYLES.stream().filter(allDeleted::contains).toList());
        var removed = admin.save(operator.token, remove);
        assertTrue(removed.deletedStyles().containsAll(art)); assertTrue(removed.deletedStyles().containsAll(deleted));
        rejected(400, () -> admin.save(operator.token, input("art-02", Map.of(), removed.revision())));
        assertEquals(removed, appearance.current()); assertEquals(4, auditCount());
    }

    @Test void breedSpecificSceneStyleWorksAtEveryAssignmentLevelAndKeepsOriginalArtSeparate() throws Exception {
        var curated = List.of("round", "retro", "premium-milkbean");
        var type = variety("pomeranian", "동그란 아이"); type.put("style", "art-16-scenes");
        var body = varieties(0, List.of(type), Map.of("pomeranian", (String) type.get("id")));
        body.put("defaultStyle", "art-16-scenes");
        body.put("breedStyles", Map.of("poodle", "art-16-scenes", "shiba", "art-16"));
        body.put("deletedStyles", curated);
        var response = http("POST", "/api/v1/admin/appearance", operator.token, mapper.writeValueAsString(body));
        assertEquals(200, response.statusCode());
        var saved = mapper.readValue(response.body(), AppearanceService.Config.class);
        assertEquals("art-16-scenes", saved.defaultStyle()); assertEquals("art-16-scenes", saved.breedStyles().get("poodle"));
        assertEquals("art-16", saved.breedStyles().get("shiba")); assertEquals("art-16-scenes", saved.varieties().getFirst().style());
        assertEquals(curated, saved.deletedStyles());
        assertEquals(saved, mapper.readValue(http("GET", "/api/v1/appearance", null, null).body(), AppearanceService.Config.class));
        rejected(400, () -> admin.save(operator.token, input("art-16-scene", Map.of(), saved.revision())));
        var deletion = new ArrayList<>(curated); deletion.add("art-16-scenes");
        rejected(400, () -> admin.save(operator.token, input("classic", Map.of(), saved.revision(), deletion)));
        var clear = varieties(saved.revision(), List.of(), Map.of());
        clear.put("defaultStyle", "art-16"); clear.put("breedStyles", Map.of()); clear.put("deletedStyles", deletion);
        var removed = admin.save(operator.token, clear);
        assertEquals("art-16", removed.defaultStyle()); assertTrue(removed.deletedStyles().contains("art-16-scenes"));
        assertFalse(removed.deletedStyles().contains("art-16")); assertTrue(removed.deletedStyles().containsAll(curated));
        rejected(400, () -> admin.save(operator.token, input("art-16-scenes", Map.of(), removed.revision())));
        assertEquals(removed, appearance.current()); assertEquals(2, auditCount());
    }

    @Test void twoSixSceneFamiliesRemainOptInAndPersistAtAllAssignmentLevels() throws Exception {
        var original = admin.save(operator.token, input("art-16-scenes", Map.of("shiba", "art-16"), 0, List.of("round")));
        assertEquals(original, appearance.current());
        assertFalse(original.breedStyles().containsValue("sp08-scenes"));
        assertFalse(original.breedStyles().containsValue("sp15-scenes"));
        var types = new ArrayList<Map<String, Object>>();
        for (String style : List.of("sp08-scenes", "sp15-scenes")) {
            var type = variety("pomeranian", style); type.put("style", style); types.add(type);
        }
        var body = varieties(original.revision(), types, Map.of("pomeranian", (String) types.getLast().get("id")));
        body.put("defaultStyle", "sp08-scenes"); body.put("breedStyles", Map.of("poodle", "sp15-scenes", "shiba", "art-16"));
        body.put("deletedStyles", original.deletedStyles());
        var response = http("POST", "/api/v1/admin/appearance", operator.token, mapper.writeValueAsString(body));
        assertEquals(200, response.statusCode());
        var saved = mapper.readValue(response.body(), AppearanceService.Config.class);
        assertEquals("sp08-scenes", saved.defaultStyle()); assertEquals("sp15-scenes", saved.breedStyles().get("poodle"));
        assertEquals("art-16", saved.breedStyles().get("shiba"));
        assertEquals(List.of("sp08-scenes", "sp15-scenes"), saved.varieties().stream().map(AppearanceService.Variety::style).toList());
        assertEquals(types.getLast().get("id"), saved.breedVarieties().get("pomeranian"));
        assertEquals(saved, mapper.readValue(http("GET", "/api/v1/appearance", null, null).body(), AppearanceService.Config.class));
        rejected(400, () -> admin.save(operator.token, input("sp16-scenes", Map.of(), saved.revision())));
        rejected(400, () -> admin.save(operator.token, input("classic", Map.of(), saved.revision(), List.of("round", "sp15-scenes"))));
        assertEquals(saved, appearance.current());
        var clear = varieties(saved.revision(), List.of(), Map.of());
        clear.put("defaultStyle", "art-16-scenes"); clear.put("breedStyles", Map.of("shiba", "art-16"));
        clear.put("deletedStyles", List.of("round", "sp08-scenes", "sp15-scenes"));
        var removed = admin.save(operator.token, clear);
        assertEquals("art-16-scenes", removed.defaultStyle());
        assertEquals(List.of("round", "sp08-scenes", "sp15-scenes"), removed.deletedStyles());
        assertTrue(removed.varieties().isEmpty()); assertTrue(removed.breedVarieties().isEmpty());
        for (String style : List.of("sp08-scenes", "sp15-scenes")) rejected(400, () -> admin.save(operator.token, input(style, Map.of(), removed.revision())));
        assertEquals(removed, appearance.current()); assertEquals(3, auditCount());
    }

    @Test void atMostTwentyTypesPerBreedAndOneHundredFortyTotalWithBoundedAudit() {
        var all = new ArrayList<Map<String, Object>>(); var active = new LinkedHashMap<String, String>();
        for (String breed : AppearanceService.BREEDS.subList(0, 7)) for (int index = 0; index < 20; index++) {
            var value = variety(breed, "🐶".repeat(20) + index); all.add(value); active.put(breed, (String)value.get("id"));
        }
        var overflow = new ArrayList<>(all); overflow.add(variety("pomeranian", "추가"));
        rejected(400, () -> admin.save(operator.token, varieties(0, overflow, active)));
        var oneBreedOverflow = new ArrayList<>(all.subList(0, 20)); oneBreedOverflow.add(variety("pomeranian", "추가"));
        rejected(400, () -> admin.save(operator.token, varieties(0, oneBreedOverflow, Map.of())));
        var body = varieties(0, all, active); body.put("deletedStyles", AppearanceService.STYLES.stream().filter(style -> !List.of("classic", "fluffy").contains(style)).toList());
        var saved = admin.save(operator.token, body); assertEquals(140, saved.varieties().size()); assertEquals(7, saved.breedVarieties().size());
        String reason = jdbc.queryForObject("select reason from admin_audit where target_type='APPEARANCE'", String.class);
        assertTrue(reason.length() <= 600); assertTrue(reason.contains("140개"));
        assertEquals(140, jdbc.queryForObject("select count(*) from appearance_varieties", Integer.class));
    }

    @Test void unauthorizedClientsCannotCreateVarietiesOrChangeActiveTypes() throws Exception {
        var body = varieties(0, List.of(variety("pomeranian", "곰돌이형")), Map.of());
        for (String token : Arrays.asList(null, account(Account.Role.USER, true, Account.Status.ACTIVE).token,
            account(Account.Role.ADMIN, false, Account.Status.ACTIVE).token, account(Account.Role.ADMIN, true, Account.Status.SUSPENDED).token)) {
            assertEquals(token == null ? 401 : 403, http("POST", "/api/v1/admin/appearance", token, mapper.writeValueAsString(body)).statusCode());
        }
        assertTrue(appearance.current().varieties().isEmpty()); assertEquals(0, auditCount());
    }

    @Test void thirtyBreedAppearanceKeysAndActiveVarietiesStayAlignedWithSavedGameIndices() throws Exception {
        assertEquals(com.puppyruby.game.BreedCatalog.IDS, AppearanceService.BREEDS); assertEquals(30, AppearanceService.BREEDS.size());
        var original = admin.save(operator.token, input("classic", Map.of("poodle", "fluffy", "samoyed", "mochi"), 0, List.of("retro")));
        var all = new ArrayList<Map<String, Object>>(); var active = new LinkedHashMap<String, String>();
        for (String breed : AppearanceService.BREEDS) {
            var variety = variety(breed, "기본 타입"); variety.put("pattern", "patches"); all.add(variety); active.put(breed, (String)variety.get("id"));
        }
        var body = varieties(original.revision(), all, active); body.put("breedStyles", original.breedStyles()); body.put("deletedStyles", original.deletedStyles());
        var saved = admin.save(operator.token, body); assertEquals(30, saved.varieties().size()); assertEquals(30, saved.breedVarieties().size());
        assertEquals(original.defaultStyle(), saved.defaultStyle()); assertEquals(original.breedStyles(), saved.breedStyles()); assertEquals(original.deletedStyles(), saved.deletedStyles());
        assertEquals(saved, mapper.readValue(http("GET", "/api/v1/appearance", null, null).body(), AppearanceService.Config.class));
        assertEquals(30, jdbc.queryForObject("select count(*) from appearance_varieties", Integer.class));
        assertEquals(30, jdbc.queryForObject("select count(*) from appearance_breed_varieties", Integer.class));
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
                try { return new Outcome(200, admin.save(operator.token, input(style, Map.of("poodle", style), revision, List.of("classic", "badge")))); }
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
