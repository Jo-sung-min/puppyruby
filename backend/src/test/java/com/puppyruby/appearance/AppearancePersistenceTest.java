package com.puppyruby.appearance;

import com.puppyruby.PuppyRubyApplication;
import com.puppyruby.admin.AdminAppearanceService;
import com.puppyruby.auth.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class AppearancePersistenceTest {
    @Test void restartPreservesRubyConfigurationUserVarietiesAndBreedSelections() {
        String database = "jdbc:h2:mem:appearance-restart-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1";
        AppearanceService.Config saved;
        String varietyId = UUID.randomUUID().toString();
        try (var first = start(database)) {
            var auth = first.getBean(AuthService.class);
            var accounts = first.getBean(AccountRepository.class);
            var login = auth.register(UUID.randomUUID().toString(), new AuthService.Register(
                "restart@appearance.test", "Appearance-Test!2026", "재기동 검증"));
            Account account = accounts.findById(login.user().id()).orElseThrow();
            account.role = Account.Role.ADMIN; account.emailVerified = true; accounts.save(account);

            Map<String, Object> variety = new LinkedHashMap<>();
            variety.put("id", varietyId); variety.put("breed", "pomeranian"); variety.put("name", "곰돌이형");
            variety.put("style", AppearanceService.DEFAULT_STYLE); variety.put("shape", "teddy"); variety.put("pattern", "patches");
            variety.put("coatColor", "#F0C090"); variety.put("patternColor", "#FFFFFF");
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("defaultStyle", AppearanceService.DEFAULT_STYLE);
            body.put("breedStyles", Map.of("pomeranian", AppearanceService.DEFAULT_STYLE));
            body.put("expectedRevision", 0); body.put("deletedStyles", List.of());
            body.put("varieties", List.of(variety)); body.put("breedVarieties", Map.of("pomeranian", varietyId));
            saved = first.getBean(AdminAppearanceService.class).save(login.token(), body);
        }
        try (var restarted = start(database)) {
            var current = restarted.getBean(AppearanceService.class).current();
            assertEquals(saved, current);
            assertEquals(AppearanceService.DEFAULT_STYLE, current.defaultStyle());
            assertEquals(Map.of(), current.breedStyles());
            assertEquals(List.of(), current.deletedStyles());
            assertEquals(varietyId, current.breedVarieties().get("pomeranian"));
            assertEquals("곰돌이형", current.varieties().getFirst().name());
            assertNull(current.varieties().getFirst().style());
            assertEquals(1, restarted.getBean(AppearanceRepository.class).count());
        }
    }

    private ConfigurableApplicationContext start(String database) {
        return new SpringApplicationBuilder(PuppyRubyApplication.class).web(WebApplicationType.NONE).run(
            "--spring.datasource.url=" + database, "--spring.datasource.username=sa", "--spring.datasource.password=",
            "--spring.jpa.hibernate.ddl-auto=update", "--MAIL_ENABLED=false", "--KAKAO_REST_API_KEY=", "--ADMIN_EMAIL=",
            "--spring.main.banner-mode=off");
    }
}
