package com.puppyruby;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.boot.SpringApplication;
import org.springframework.core.env.Environment;

/** Local configuration for the real main entry point only, never the test/application builders. */
final class BackendEnvironment {
    private static final Set<String> SETTINGS = Set.of(
        "PORT", "SERVER_ADDRESS", "PUBLIC_SITE_URL", "ADMIN_EMAIL",
        "DB_URL", "DB_USERNAME", "DB_PASSWORD", "DB_SCHEMA", "DB_POOL_MAX_SIZE", "DB_POOL_MIN_IDLE", "FLYWAY_ENABLED",
        "KAKAO_REST_API_KEY", "KAKAO_CLIENT_SECRET", "MAIL_ENABLED", "MAIL_HOST", "MAIL_PORT", "MAIL_USERNAME",
        "MAIL_PASSWORD", "MAIL_FROM", "MAIL_STARTTLS", "TOSS_CLIENT_KEY", "TOSS_SECRET_KEY", "TOSS_LIVE_ENABLED",
        "S3_UPLOAD_ENABLED", "DESKTOP_RELEASE_UPLOAD_ENABLED", "S3_BUCKET", "AWS_REGION", "S3_KEY_PREFIX", "CDN_BASE_URL", "CDN_ORIGIN_PATH",
        "S3_PRESIGN_TTL_SECONDS", "S3_MAX_UPLOAD_BYTES", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"
    );

    private BackendEnvironment() {}

    static void configure(SpringApplication application, Path workingDirectory) {
        // Standard Spring precedence: command line / service environment override local defaults.
        application.setDefaultProperties(read(workingDirectory));
        application.addInitializers(context -> validateDatabase(context.getEnvironment()));
    }

    static Path configurationDirectory(Path workingDirectory) {
        Path directory = workingDirectory.toAbsolutePath().normalize();
        // A checkout root may have a different .env for legacy Docker tools; never read that file.
        if (Files.isRegularFile(directory.resolve("backend/build.gradle"))) return directory.resolve("backend");
        return directory;
    }

    static Map<String, Object> read(Path workingDirectory) {
        Path directory = configurationDirectory(workingDirectory);
        Map<String, Object> values = new LinkedHashMap<>();
        for (String name : new String[] {".env", ".env.local"}) {
            Path file = directory.resolve(name);
            if (!Files.exists(file)) continue;
            try {
                int number = 0;
                for (String raw : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                    number++;
                    String line = (number == 1 ? raw.replaceFirst("^\uFEFF", "") : raw).strip();
                    if (line.isEmpty() || line.startsWith("#")) continue;
                    if (line.startsWith("export ")) line = line.substring(7).strip();
                    int separator = line.indexOf('=');
                    if (separator < 1) throw invalidEntry(name, number);
                    String key = line.substring(0, separator).strip();
                    if (!SETTINGS.contains(key)) throw invalidEntry(name, number);
                    String value = line.substring(separator + 1).strip();
                    if (value.startsWith("\"") || value.startsWith("'")) {
                        if (value.length() < 2 || value.charAt(value.length() - 1) != value.charAt(0)) {
                            throw invalidEntry(name, number);
                        }
                        value = value.substring(1, value.length() - 1);
                    }
                    values.put(key, value);
                }
            } catch (IOException error) {
                // Do not attach exceptions that might contain credential-bearing file contents.
                throw new IllegalStateException(name + " 파일을 읽을 수 없습니다. backend 환경파일 권한을 확인해 주세요.");
            }
        }
        return values;
    }

    private static IllegalStateException invalidEntry(String file, int line) {
        return new IllegalStateException(file + ":" + line + " 환경설정 형식을 확인해 주세요. backend/.env.example의 KEY=value 형식을 사용하세요.");
    }

    static void validateDatabase(Environment environment) {
        requirePostgres(environment, "spring.datasource.url", "DB_URL 또는 SPRING_DATASOURCE_URL", true);
        // These overrides would otherwise bypass the validated datasource selection.
        requirePostgres(environment, "spring.datasource.hikari.jdbc-url", "SPRING_DATASOURCE_HIKARI_JDBC_URL", false);
        requirePostgres(environment, "spring.flyway.url", "SPRING_FLYWAY_URL", false);
        String username = setting(environment, "spring.datasource.username");
        if (username == null || username.isBlank() || username.contains("${")) {
            throw new IllegalStateException("DB_USERNAME이 없습니다. backend/.env 또는 실행 환경에 PostgreSQL 사용자명을 설정해 주세요.");
        }
    }

    private static void requirePostgres(Environment environment, String key, String label, boolean required) {
        String value = setting(environment, key);
        if (!required && value == null) return;
        if (value == null || !value.startsWith("jdbc:postgresql:") || value.length() <= "jdbc:postgresql:".length()
            || !value.equals(value.strip()) || value.contains("${")) {
            throw new IllegalStateException(label + " 설정이 없거나 형식이 잘못됐습니다. backend/.env 또는 실행 환경에 jdbc:postgresql://호스트:포트/DB이름 형식으로 지정해 주세요. 환경파일은 Git pull로 내려오지 않습니다.");
        }
    }

    private static String setting(Environment environment, String key) {
        try {
            return environment.getProperty(key);
        } catch (IllegalArgumentException error) {
            // Placeholder exceptions can quote raw values; return a safe missing-value error instead.
            return null;
        }
    }
}
