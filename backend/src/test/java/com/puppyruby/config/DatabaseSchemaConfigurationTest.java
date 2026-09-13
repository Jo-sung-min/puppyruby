package com.puppyruby.config;

import com.puppyruby.PuppyRubyApplication;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class DatabaseSchemaConfigurationTest {
    @Test void explicitDatabaseVariablesBindAndNativeQueriesUseTheSameSchemaAsJpa() throws Exception {
        // A fresh in-memory database only: no local dotenv files or hosted DB are loaded by this test.
        String schema = "Tenant_" + UUID.randomUUID().toString().replace("-", "");
        String url = "jdbc:h2:mem:schema-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1;INIT=CREATE SCHEMA IF NOT EXISTS \"" + schema + "\"";
        try (var context = start(url, schema)) {
            HikariDataSource pool = context.getBean(HikariDataSource.class);
            assertEquals(url, pool.getJdbcUrl()); assertEquals("sa", pool.getUsername()); assertEquals("isolated-test-password", pool.getPassword());
            assertEquals(schema, pool.getSchema());
            try (var connection = pool.getConnection()) { assertEquals(schema, connection.getSchema()); }
            assertEquals('"' + schema + '"', context.getBean(EntityManagerFactory.class).getProperties().get("hibernate.default_schema"));
            var jdbc = context.getBean(JdbcTemplate.class);
            assertEquals(1, jdbc.queryForObject("select count(*) from information_schema.tables where table_schema = ? and table_name = 'PUPPIES'", Integer.class, schema));
            assertEquals(0, jdbc.queryForObject("select count(*) from information_schema.tables where table_schema = 'PUBLIC' and table_name = 'PUPPIES'", Integer.class));
            assertNotNull(jdbc.queryForObject("select count(*) from puppies", Long.class));
        }
    }

    @Test void missingSchemaLeavesTheExistingH2DefaultAndNativeQueriesWorking() throws Exception {
        String url = "jdbc:h2:mem:schema-default-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1";
        try (var context = start(url, "")) {
            HikariDataSource pool = context.getBean(HikariDataSource.class);
            assertNull(pool.getSchema());
            try (var connection = pool.getConnection()) { assertEquals("PUBLIC", connection.getSchema()); }
            assertNull(context.getBean(EntityManagerFactory.class).getProperties().get("hibernate.default_schema"));
            assertNotNull(context.getBean(JdbcTemplate.class).queryForObject("select count(*) from puppies", Long.class));
        }
    }

    @Test void schemaIdentifierValidationDoesNotEchoInvalidConfiguration() {
        assertNull(DatabaseSchemaConfiguration.schema(null)); assertNull(DatabaseSchemaConfiguration.schema("  "));
        assertEquals("public", DatabaseSchemaConfiguration.schema(" public "));
        assertEquals("Tenant_One", DatabaseSchemaConfiguration.schema("Tenant_One"));
        assertEquals("a".repeat(63), DatabaseSchemaConfiguration.schema("a".repeat(63)));
        for (String value : new String[]{"private;drop table puppies", "public,other", "a".repeat(64), "1schema", "\"private\"", "name\nsecret"}) {
            var error = assertThrows(IllegalArgumentException.class, () -> DatabaseSchemaConfiguration.schema(value));
            assertFalse(error.getMessage().contains(value));
        }
    }

    private ConfigurableApplicationContext start(String url, String schema) {
        return new SpringApplicationBuilder(PuppyRubyApplication.class).web(WebApplicationType.NONE).run(
            "--DB_URL=" + url, "--DB_USERNAME=sa", "--DB_PASSWORD=isolated-test-password", "--DB_SCHEMA=" + schema,
            "--spring.jpa.hibernate.ddl-auto=create-drop", "--MAIL_ENABLED=false", "--KAKAO_REST_API_KEY=", "--ADMIN_EMAIL=",
            "--S3_UPLOAD_ENABLED=false", "--spring.main.banner-mode=off");
    }
}
