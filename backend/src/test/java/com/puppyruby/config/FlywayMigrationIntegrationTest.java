package com.puppyruby.config;

import com.puppyruby.PuppyRubyApplication;
import com.puppyruby.game.GameService;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/** Exercises Spring Boot's real startup ordering: Flyway first, then Hibernate validation. */
class FlywayMigrationIntegrationTest {
    private static final String PASSWORD = "isolated-migration-test";
    private static final Set<String> APPLICATION_TABLES = Set.of(
        "accounts", "admin_audit", "appearance_settings", "appearance_breed_styles", "appearance_deleted_styles",
        "appearance_varieties", "appearance_breed_varieties", "auth_mutex", "auth_sessions", "auth_email_tokens",
        "commerce_settings", "commerce_wallets", "commerce_items", "commerce_ticket_ledger", "commerce_draws",
        "desktop_mutex", "desktop_pairings", "desktop_devices", "desktop_receipts", "media_uploads", "payment_orders",
        "players", "puppies", "seo_settings", "seo_pages", "walk_mutex", "walk_profiles", "walk_rooms",
        "walk_messages", "walk_friendships");

    @TempDir Path fixtures;

    @Test void emptyDatabaseMigratesAllTablesBeforeHibernateValidationAndDisallowsClean() {
        try (var context = start(database(), "")) {
            Flyway flyway = context.getBean(Flyway.class);
            var configuration = flyway.getConfiguration();
            assertFalse(configuration.isBaselineOnMigrate());
            assertTrue(configuration.isCleanDisabled());
            assertTrue(configuration.isValidateOnMigrate());
            assertTrue(configuration.isValidateMigrationNaming());
            assertTrue(configuration.isFailOnMissingLocations());
            assertEquals("validate", context.getBean(EntityManagerFactory.class).getProperties().get("hibernate.hbm2ddl.auto"));
            assertEquals("1", flyway.info().current().getVersion().getVersion());
            assertEquals(1, flyway.info().applied().length);
            assertEquals(0, flyway.info().pending().length);
            assertEquals("classpath:db/migration/h2", configuration.getLocations()[0].getDescriptor());
            var jdbc = context.getBean(JdbcTemplate.class);
            assertEquals(APPLICATION_TABLES, applicationTables(jdbc, "PUBLIC"));
            assertThrows(FlywayException.class, flyway::clean);
            assertEquals(APPLICATION_TABLES, applicationTables(jdbc, "PUBLIC"));
            assertEquals(1, jdbc.queryForObject("select count(*) from \"flyway_schema_history\" where \"success\" = true and \"version\" = '1'", Integer.class));
        }
    }

    @Test void aSecondStartupDoesNotRepeatMigrationOrLosePuppyData() {
        String url = database(), playerId = UUID.randomUUID().toString();
        String puppyId;
        int coins;
        try (var first = start(url, "")) {
            GameService game = first.getBean(GameService.class);
            puppyId = game.state(playerId).selectedId();
            game.act(playerId, "rename", new GameService.Action(puppyId, "이사해도 루비", null, null, null));
            coins = game.act(playerId, "feed", new GameService.Action(puppyId, null, null, null, null)).state().coins();
        }
        try (var second = start(url, "")) {
            GameService.State state = second.getBean(GameService.class).state(playerId);
            assertEquals(puppyId, state.selectedId());
            assertEquals(coins, state.coins());
            assertEquals(1, state.careCount());
            assertEquals("이사해도 루비", state.puppies().getFirst().name);
            assertEquals(10, state.puppies().getFirst().xp);
            assertEquals(1, second.getBean(Flyway.class).info().applied().length);
            assertEquals(1, second.getBean(JdbcTemplate.class).queryForObject("select count(*) from players", Integer.class));
        }
    }

    @Test void mixedCaseSchemaIsSharedByFlywayJpaAndNativeQueries() throws Exception {
        String url = database(), schema = "Tenant_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(url, "sa", PASSWORD); var statement = connection.createStatement()) {
            statement.execute("create schema \"" + schema + "\"");
        }
        try (var context = start(url, schema)) {
            var configuration = context.getBean(Flyway.class).getConfiguration();
            assertEquals(schema, configuration.getDefaultSchema());
            assertArrayEquals(new String[]{schema}, configuration.getSchemas());
            assertEquals(schema, context.getBean(HikariDataSource.class).getSchema());
            assertEquals('"' + schema + '"', context.getBean(EntityManagerFactory.class).getProperties().get("hibernate.default_schema"));
            var jdbc = context.getBean(JdbcTemplate.class);
            assertEquals(APPLICATION_TABLES, applicationTables(jdbc, schema));
            assertTrue(applicationTables(jdbc, "PUBLIC").isEmpty());
            assertEquals(1, jdbc.queryForObject("select count(*) from \"flyway_schema_history\" where \"success\" = true and \"version\" = '1'", Integer.class));
            assertNotNull(jdbc.queryForObject("select count(*) from puppies", Long.class));
        }
    }

    @Test void nonEmptyDatabaseWithoutHistoryIsRefusedWithoutChangingExistingData() throws Exception {
        String url = database();
        try (var connection = DriverManager.getConnection(url, "sa", PASSWORD); var statement = connection.createStatement()) {
            statement.execute("create table unmanaged_marker (id integer primary key, note varchar(80))");
            statement.execute("insert into unmanaged_marker values (1, 'keep this existing data')");
        }
        RuntimeException failure = assertThrows(RuntimeException.class, () -> {
            try (var ignored = start(url, "")) { fail("An unmanaged non-empty schema must require explicit review."); }
        });
        assertFlywayFailure(failure, "non-empty");
        try (var connection = DriverManager.getConnection(url, "sa", PASSWORD); var statement = connection.createStatement()) {
            try (var result = statement.executeQuery("select note from unmanaged_marker where id = 1")) {
                assertTrue(result.next()); assertEquals("keep this existing data", result.getString(1));
            }
            try (var result = statement.executeQuery("select count(*) from information_schema.tables where table_schema = 'PUBLIC' and table_name in ('PLAYERS', 'flyway_schema_history')")) {
                assertTrue(result.next()); assertEquals(0, result.getInt(1));
            }
        }
    }

    @Test void aChangedAppliedMigrationIsRejectedBeforeAnyChangedSqlExecutes() throws Exception {
        String url = database();
        Path migration = copyInitialMigration();
        String location = "--spring.flyway.locations=filesystem:" + fixtures.toAbsolutePath().toString().replace('\\', '/');
        Integer originalChecksum;
        try (var first = start(url, "", location)) {
            originalChecksum = first.getBean(Flyway.class).info().current().getChecksum();
            first.getBean(GameService.class).state(UUID.randomUUID().toString());
        }
        Files.writeString(migration, Files.readString(migration, StandardCharsets.UTF_8)
            + "\ncreate table changed_migration_should_not_run (id integer);\n", StandardCharsets.UTF_8);
        RuntimeException failure = assertThrows(RuntimeException.class, () -> {
            try (var ignored = start(url, "", location)) { fail("Applied SQL must not be silently rewritten."); }
        });
        assertFlywayFailure(failure, "checksum");
        try (var connection = DriverManager.getConnection(url, "sa", PASSWORD); var statement = connection.createStatement()) {
            try (var result = statement.executeQuery("select \"checksum\" from \"flyway_schema_history\" where \"version\" = '1'")) {
                assertTrue(result.next()); assertEquals(originalChecksum.intValue(), result.getInt(1));
            }
            try (var result = statement.executeQuery("select count(*) from players")) {
                assertTrue(result.next()); assertEquals(1, result.getInt(1));
            }
            try (var result = statement.executeQuery("select count(*) from information_schema.tables where table_name = 'CHANGED_MIGRATION_SHOULD_NOT_RUN'")) {
                assertTrue(result.next()); assertEquals(0, result.getInt(1));
            }
        }
    }

    @Test void aNewForwardMigrationRunsOnceAndPreservesExistingRows() throws Exception {
        String url = database(), playerId = UUID.randomUUID().toString();
        copyInitialMigration();
        String location = "--spring.flyway.locations=filesystem:" + fixtures.toAbsolutePath().toString().replace('\\', '/');
        String puppyId;
        try (var first = start(url, "", location)) {
            puppyId = first.getBean(GameService.class).state(playerId).selectedId();
        }
        Files.writeString(fixtures.resolve("V2__test_forward_migration.sql"), "create table migration_test_notes (id integer primary key, note varchar(80));\ninsert into migration_test_notes values (1, 'forward migration');\n", StandardCharsets.UTF_8);
        try (var second = start(url, "", location)) {
            assertEquals("2", second.getBean(Flyway.class).info().current().getVersion().getVersion());
            assertEquals(2, second.getBean(Flyway.class).info().applied().length);
            assertEquals(puppyId, second.getBean(GameService.class).state(playerId).selectedId());
            assertEquals("forward migration", second.getBean(JdbcTemplate.class).queryForObject("select note from migration_test_notes where id = 1", String.class));
        }
        try (var third = start(url, "", location)) {
            assertEquals(2, third.getBean(Flyway.class).info().applied().length);
            assertEquals(1, third.getBean(JdbcTemplate.class).queryForObject("select count(*) from migration_test_notes", Integer.class));
            assertEquals(puppyId, third.getBean(GameService.class).state(playerId).selectedId());
        }
    }

    private Path copyInitialMigration() throws Exception {
        Path migration = fixtures.resolve("V1__initial_schema.sql");
        try (var source = getClass().getResourceAsStream("/db/migration/h2/V1__initial_schema.sql")) {
            assertNotNull(source, "The real initial migration must be packaged as a main resource.");
            Files.copy(source, migration);
        }
        return migration;
    }

    private Set<String> applicationTables(JdbcTemplate jdbc, String schema) {
        return jdbc.queryForList("select table_name from information_schema.tables where table_schema = ? and table_type = 'BASE TABLE'", String.class, schema)
            .stream().map(name -> name.toLowerCase(Locale.ROOT)).filter(name -> !name.equals("flyway_schema_history")).collect(Collectors.toSet());
    }

    private void assertFlywayFailure(Throwable failure, String messagePart) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof FlywayException && cause.getMessage().toLowerCase(Locale.ROOT).contains(messagePart)) return;
        }
        fail("Expected a Flyway failure containing '" + messagePart + "'.", failure);
    }

    private String database() { return "jdbc:h2:mem:migration-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1"; }

    private ConfigurableApplicationContext start(String url, String schema, String... overrides) {
        // Explicit CLI properties override inherited shell values; no dotenv or real DB is used.
        var args = new ArrayList<>(Arrays.asList("--DB_URL=" + url, "--DB_USERNAME=sa", "--DB_PASSWORD=" + PASSWORD, "--DB_SCHEMA=" + schema,
            "--spring.datasource.url=" + url, "--spring.datasource.username=sa", "--spring.datasource.password=" + PASSWORD,
            "--spring.flyway.url=" + url, "--spring.flyway.user=sa", "--spring.flyway.password=" + PASSWORD,
            "--spring.flyway.enabled=true", "--spring.jpa.hibernate.ddl-auto=validate", "--MAIL_ENABLED=false", "--KAKAO_REST_API_KEY=",
            "--ADMIN_EMAIL=", "--S3_UPLOAD_ENABLED=false", "--spring.main.banner-mode=off", "--logging.level.root=ERROR"));
        args.addAll(Arrays.asList(overrides));
        return new SpringApplicationBuilder(PuppyRubyApplication.class).web(WebApplicationType.NONE).run(args.toArray(String[]::new));
    }
}
