package com.puppyruby;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import static org.junit.jupiter.api.Assertions.*;

class BackendEnvironmentTest {
    @TempDir Path directory;

    @Test void rootUsesBackendFilesAndLocalOverridesWithoutReadingRootSecrets() throws Exception {
        Files.writeString(directory.resolve(".env"), "DB_URL=wrong-root-file\n");
        Path backend = Files.createDirectories(directory.resolve("backend"));
        Files.writeString(backend.resolve("build.gradle"), "");
        Files.writeString(backend.resolve(".env"), "\uFEFF# literal dotenv\nDB_URL=jdbc:postgresql://example.test/puppy\nDB_PASSWORD=\"a=b#c\\d\"\nDB_SCHEMA=old\n");
        Files.writeString(backend.resolve(".env.local"), "export DB_SCHEMA=\nPORT='8081'\n");
        Map<String, Object> settings = BackendEnvironment.read(directory);
        assertEquals("jdbc:postgresql://example.test/puppy", settings.get("DB_URL"));
        assertEquals("a=b#c\\d", settings.get("DB_PASSWORD"));
        assertEquals("", settings.get("DB_SCHEMA"));
        assertEquals("8081", settings.get("PORT"));
        assertEquals(settings, BackendEnvironment.read(backend));
    }

    @Test void invalidFileErrorsNeverEchoValuesOrLineContents() throws Exception {
        for (String line : new String[] {"secret-marker-without-equals", "NOT_ALLOWED=secret-marker", "DB_PASSWORD=\"secret-marker"}) {
            Files.writeString(directory.resolve(".env"), line);
            var error = assertThrows(IllegalStateException.class, () -> BackendEnvironment.read(directory));
            assertTrue(error.getMessage().contains(".env:1"));
            assertFalse(error.getMessage().contains("secret-marker"));
            assertNull(error.getCause());
        }
    }

    @Test void mainBootstrapResolvesEnvPlaceholdersBeforeDatabaseBeans() throws Exception {
        Files.writeString(directory.resolve(".env"), "DB_URL=jdbc:postgresql://example.test/puppy\nDB_USERNAME=puppy\n");
        Files.writeString(directory.resolve(".env.local"), "DB_SCHEMA=\n");
        try (var context = application(Map.of()).run(configArgument())) {
            assertEquals("jdbc:postgresql://example.test/puppy", context.getEnvironment().getProperty("spring.datasource.url"));
            assertEquals("puppy", context.getEnvironment().getProperty("spring.datasource.username"));
            assertEquals("", context.getEnvironment().getProperty("DB_SCHEMA"));
        }
    }

    @Test void explicitServiceEnvironmentAndCommandLineOverrideLocalFiles() throws Exception {
        Files.writeString(directory.resolve(".env"), "DB_URL=jdbc:postgresql://local.test/puppy\nDB_USERNAME=local\n");
        try (var context = application(Map.of("DB_URL", "jdbc:postgresql://service.test/puppy", "DB_USERNAME", "service"))
                .run(configArgument(), "--spring.datasource.url=jdbc:postgresql://command.test/puppy")) {
            assertEquals("jdbc:postgresql://command.test/puppy", context.getEnvironment().getProperty("spring.datasource.url"));
            assertEquals("service", context.getEnvironment().getProperty("spring.datasource.username"));
        }
    }

    @Test void missingEnvStopsWithActionableSafeMessage() throws Exception {
        var error = assertThrows(IllegalStateException.class, () -> application(Map.of()).run(configArgument()));
        assertTrue(error.getMessage().contains("DB_URL"));
        assertTrue(error.getMessage().contains("jdbc:postgresql://"));
        assertFalse(error.getMessage().contains("must start with"));
    }

    @Test void rejectsNonJdbcAndUnresolvedValuesWithoutLeakingCredentials() {
        for (String url : new String[] {"", " ", "${DB_URL}", "postgresql://user:secret-marker@example.test/db", "jdbc:h2:mem:test", "\"jdbc:postgresql://secret-marker/db\""}) {
            var environment = environment(Map.of("spring.datasource.url", url, "spring.datasource.username", "puppy"));
            var error = assertThrows(IllegalStateException.class, () -> BackendEnvironment.validateDatabase(environment));
            assertFalse(error.getMessage().contains("secret-marker"));
            assertNull(error.getCause());
        }
    }

    @Test void validatesIndependentHikariAndFlywayOverridesAndMissingUsername() {
        for (String key : new String[] {"spring.datasource.hikari.jdbc-url", "spring.flyway.url"}) {
            var environment = environment(Map.of("spring.datasource.url", "jdbc:postgresql://example.test/db",
                "spring.datasource.username", "puppy", key, "postgres://secret-marker"));
            var error = assertThrows(IllegalStateException.class, () -> BackendEnvironment.validateDatabase(environment));
            assertFalse(error.getMessage().contains("secret-marker"));
        }
        var error = assertThrows(IllegalStateException.class, () -> BackendEnvironment.validateDatabase(
            environment(Map.of("spring.datasource.url", "jdbc:postgresql://example.test/db"))));
        assertTrue(error.getMessage().contains("DB_USERNAME"));
    }

    private SpringApplication application(Map<String, Object> serviceSettings) {
        SpringApplication application = new SpringApplication(EmptyApplication.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        application.setLogStartupInfo(false);
        application.setEnvironment(environment(serviceSettings));
        BackendEnvironment.configure(application, directory);
        return application;
    }

    private String configArgument() throws Exception {
        Path config = directory.resolve("application.properties");
        Files.writeString(config, "spring.datasource.url=${DB_URL:}\nspring.datasource.username=${DB_USERNAME:}\nspring.main.banner-mode=off\n");
        return "--spring.config.location=" + config.toUri();
    }

    private StandardEnvironment environment(Map<String, Object> values) {
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().addFirst(new MapPropertySource("explicit-test-settings", values));
        return environment;
    }

    public static class EmptyApplication {}
}
