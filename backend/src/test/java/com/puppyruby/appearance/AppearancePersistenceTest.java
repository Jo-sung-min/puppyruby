package com.puppyruby.appearance;

import com.puppyruby.PuppyRubyApplication;
import com.puppyruby.admin.AdminAppearanceService;
import com.puppyruby.auth.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class AppearancePersistenceTest {
    @Test void closingAndRecreatingTheApplicationPreservesSavedStylesAndRevision() {
        String database = "jdbc:h2:mem:appearance-restart-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1";
        AppearanceService.Config saved;
        String varietyId = UUID.randomUUID().toString();
        String meadowVarietyId = UUID.randomUUID().toString();
        String cuteVarietyId = UUID.randomUUID().toString();
        try (var first = start(database)) {
            var auth = first.getBean(AuthService.class);
            var accounts = first.getBean(AccountRepository.class);
            var login = auth.register(UUID.randomUUID().toString(), new AuthService.Register("restart@appearance.test", "Appearance-Test!2026", "재기동 검증"));
            Account admin = accounts.findById(login.user().id()).orElseThrow();
            admin.role = Account.Role.ADMIN; admin.emailVerified = true; accounts.save(admin);
            saved = first.getBean(AdminAppearanceService.class).save(login.token(), Map.of(
                "defaultStyle", "cozy-chubby", "breedStyles", Map.of("maltese", "soft", "samoyed", "meadow", "pomeranian", "bean-slim"), "expectedRevision", 0,
                "deletedStyles", List.of("classic", "retro", "badge", "bright-loaf"),
                "varieties", List.of(Map.of("id", varietyId, "breed", "maltese", "name", "곰돌이형", "style", "animated-2d",
                    "shape", "teddy", "pattern", "socks", "coatColor", "#F0C090", "patternColor", "#FFFFFF"),
                    Map.of("id", meadowVarietyId, "breed", "samoyed", "name", "풀밭 친구", "style", "meadow",
                        "shape", "original", "pattern", "solid", "coatColor", "#FFF9ED", "patternColor", "#FFFFFF"),
                    Map.of("id", cuteVarietyId, "breed", "pomeranian", "name", "단추 긴다리", "style", "button-tall",
                        "shape", "original", "pattern", "solid", "coatColor", "#FFF9ED", "patternColor", "#FFFFFF")),
                "breedVarieties", Map.of("maltese", varietyId, "samoyed", meadowVarietyId, "pomeranian", cuteVarietyId)));
        }
        try (var restarted = start(database)) {
            assertEquals(saved, restarted.getBean(AppearanceService.class).current());
            assertEquals(List.of("classic", "retro", "badge", "bright-loaf"), restarted.getBean(AppearanceService.class).current().deletedStyles());
            assertEquals(varietyId, restarted.getBean(AppearanceService.class).current().breedVarieties().get("maltese"));
            assertEquals("animated-2d", restarted.getBean(AppearanceService.class).current().varieties().getFirst().style());
            assertEquals("cozy-chubby", restarted.getBean(AppearanceService.class).current().defaultStyle());
            assertEquals("meadow", restarted.getBean(AppearanceService.class).current().breedStyles().get("samoyed"));
            assertEquals(meadowVarietyId, restarted.getBean(AppearanceService.class).current().breedVarieties().get("samoyed"));
            assertEquals("meadow", restarted.getBean(AppearanceService.class).current().varieties().get(1).style());
            assertEquals("bean-slim", restarted.getBean(AppearanceService.class).current().breedStyles().get("pomeranian"));
            assertEquals(cuteVarietyId, restarted.getBean(AppearanceService.class).current().breedVarieties().get("pomeranian"));
            assertEquals("button-tall", restarted.getBean(AppearanceService.class).current().varieties().getLast().style());
            assertEquals(1, restarted.getBean(AppearanceRepository.class).count());
        }
    }
    private ConfigurableApplicationContext start(String database) {
        // Command-line properties take precedence over local application.yml and environment settings.
        return new SpringApplicationBuilder(PuppyRubyApplication.class).web(WebApplicationType.NONE).run(
            "--spring.datasource.url=" + database, "--spring.datasource.username=sa", "--spring.datasource.password=",
            "--spring.jpa.hibernate.ddl-auto=update", "--MAIL_ENABLED=false", "--KAKAO_REST_API_KEY=", "--ADMIN_EMAIL=",
            "--spring.main.banner-mode=off");
    }
}
