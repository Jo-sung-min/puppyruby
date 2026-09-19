package com.puppyruby.appearance;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:ruby-only-appearance;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop",
    "MAIL_ENABLED=false", "KAKAO_REST_API_KEY=", "ADMIN_EMAIL="
})
class RubyOnlyAppearanceTest {
    @Autowired AppearanceService appearance;
    @Autowired AppearanceRepository repository;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach void reset() { repository.deleteAll(); }

    @Test void missingAndLegacyConfigurationsAlwaysResolveToRubyRound() {
        assertEquals(AppearanceService.DEFAULT_STYLE, appearance.current().defaultStyle());
        assertEquals(Map.of(), appearance.current().breedStyles());

        String varietyId = UUID.randomUUID().toString();
        AppearanceSettings legacy = new AppearanceSettings();
        legacy.defaultStyle = "art-16-scenes";
        legacy.breedStyles.put("pomeranian", "sp08-scenes");
        legacy.deletedStyles.add("classic");
        legacy.varieties.add(new AppearanceVariety(new AppearanceService.Variety(varietyId, "pomeranian", "곰돌이형",
            "premium-caramel", "teddy", "patches", "#F0C090", "#FFFFFF")));
        legacy.breedVarieties.put("pomeranian", varietyId);
        legacy.revision = 7;
        repository.saveAndFlush(legacy);

        var safe = appearance.current();
        assertEquals(AppearanceService.DEFAULT_STYLE, safe.defaultStyle());
        assertEquals(Map.of(), safe.breedStyles());
        assertEquals(List.of(), safe.deletedStyles());
        assertNull(safe.varieties().getFirst().style());
        assertEquals(varietyId, safe.breedVarieties().get("pomeranian"));
        assertEquals(7, safe.revision());
    }

    @Test void saveAcceptsOnlyRubyAndRemovesEveryLegacyAssetReference() {
        assertThrows(ResponseStatusException.class, () -> AppearanceService.parse(Map.of(
            "defaultStyle", "classic", "breedStyles", Map.of(), "expectedRevision", 0)));

        String varietyId = UUID.randomUUID().toString();
        AppearanceSettings legacy = new AppearanceSettings();
        legacy.defaultStyle = "art-16-scenes";
        legacy.breedStyles.put("pomeranian", "sp08-scenes");
        legacy.deletedStyles.add("classic");
        legacy.varieties.add(new AppearanceVariety(new AppearanceService.Variety(varietyId, "pomeranian", "여우형",
            "classic", "fox", "solid", null, "#FFFFFF")));
        legacy.breedVarieties.put("pomeranian", varietyId);
        repository.saveAndFlush(legacy);

        // Legacy clients omit varieties and deleted styles. Saving still has to
        // preserve their user records while scrubbing every retired asset ID.
        var saved = appearance.update(new AppearanceService.Input(AppearanceService.DEFAULT_STYLE, Map.of(), 0L));

        assertEquals(AppearanceService.DEFAULT_STYLE, saved.defaultStyle());
        assertEquals(Map.of(), saved.breedStyles());
        assertEquals(List.of(), saved.deletedStyles());
        assertNull(saved.varieties().getFirst().style());
        assertEquals("여우형", saved.varieties().getFirst().name());
        assertEquals(varietyId, saved.breedVarieties().get("pomeranian"));
        assertEquals(0, jdbc.queryForObject("select count(*) from appearance_breed_styles", Integer.class));
        assertEquals(0, jdbc.queryForObject("select count(*) from appearance_deleted_styles", Integer.class));
        assertNull(jdbc.queryForObject("select style from appearance_varieties", String.class));
    }
}
