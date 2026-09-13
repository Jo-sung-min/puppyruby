package com.puppyruby.seo;

import com.puppyruby.PuppyRubyApplication;
import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import java.util.Map;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class SeoPersistenceTest {
    @Test void settingsAndPageOverridesSurviveApplicationRestart() {
        String database = "jdbc:h2:mem:seo-restart-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1"; SeoService.Config saved;
        try (var first = start(database)) {
            var service = first.getBean(SeoService.class);
            saved = service.update(new SeoService.Input("저장된 사이트", "https://site.example", "검색 제목", "검색 설명", "https://images.example/og.png",
                "공유 이미지", "google-token", "naver-token", false, Map.of("home", new SeoService.Page("", "", true),
                    "play", new SeoService.Page("놀이", "", false), "shop", new SeoService.Page("상점", "상점 소개", false)), 0L));
        }
        try (var restarted = start(database)) {
            assertEquals(saved, restarted.getBean(SeoService.class).current()); assertEquals(1, restarted.getBean(SeoRepository.class).count());
        }
    }
    ConfigurableApplicationContext start(String database) {
        return new SpringApplicationBuilder(PuppyRubyApplication.class).web(WebApplicationType.NONE).run("--spring.datasource.url=" + database,
            "--spring.datasource.username=sa", "--spring.datasource.password=", "--spring.jpa.hibernate.ddl-auto=update", "--MAIL_ENABLED=false",
            "--KAKAO_REST_API_KEY=", "--ADMIN_EMAIL=", "--S3_UPLOAD_ENABLED=false", "--spring.main.banner-mode=off");
    }
}
