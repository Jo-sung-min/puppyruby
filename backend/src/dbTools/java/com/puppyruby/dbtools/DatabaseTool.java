package com.puppyruby.dbtools;

import jakarta.persistence.Entity;
import java.io.OutputStream;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.util.*;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.hibernate.boot.Metadata;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.hibernate.tool.schema.spi.*;
import org.springframework.jdbc.datasource.AbstractDataSource;

/** Deliberately separate from SpringApplication: no application beans, seeders, or web server run. */
public final class DatabaseTool {
    private DatabaseTool() {}
    private static final String HISTORY = "flyway_schema_history";
    private static String phase = "arguments";
    private static final Set<String> V1_TABLES = Set.of(
        "accounts", "admin_audit", "appearance_breed_styles", "appearance_breed_varieties", "appearance_deleted_styles",
        "appearance_settings", "appearance_varieties", "auth_email_tokens", "auth_mutex", "auth_sessions",
        "commerce_draws", "commerce_items", "commerce_settings", "commerce_ticket_ledger", "commerce_wallets",
        "desktop_devices", "desktop_mutex", "desktop_pairings", "desktop_receipts", "media_uploads", "payment_orders",
        "players", "puppies", "seo_pages", "seo_settings", "walk_friendships", "walk_messages", "walk_mutex", "walk_profiles", "walk_rooms");

    public static void main(String[] args) {
        PrintStream output = System.out;
        // JDBC/Flyway/Hibernate errors may contain a URL or credentials. Only the summaries below escape.
        System.setOut(new PrintStream(OutputStream.nullOutputStream()));
        System.setErr(new PrintStream(OutputStream.nullOutputStream()));
        try { output.println(run(args)); }
        catch (Throwable error) {
            String code = "DBTOOL_FAILED", state = "";
            for (Throwable cause = error; cause != null; cause = cause.getCause()) {
                if (cause instanceof Refused refused) { code = refused.code; break; }
                if (cause instanceof SchemaManagementException) code = "SCHEMA_MISMATCH";
                if (cause instanceof SQLException sql) {
                    code = "DATABASE_ERROR";
                    if (sql.getSQLState() != null && sql.getSQLState().matches("[A-Z0-9]{5}")) state = sql.getSQLState();
                    String message = sql.getMessage() == null ? "" : sql.getMessage().toLowerCase(Locale.ROOT);
                    if (message.contains("tenant") && message.contains("user")) code = "TENANT_OR_USER";
                    else if (message.contains("max client") || message.contains("maxclients")
                        || message.contains("remaining connection") || message.contains("too many")
                        || message.contains("pool_size")) code = "CONNECTION_LIMIT";
                    else if (state.startsWith("08")) code = "CONNECTION";
                    else if (state.equals("25006") || message.contains("read-only") || message.contains("read only")) code = "READ_ONLY";
                }
            }
            output.println("{\"success\":false,\"error\":\"" + code + "\",\"sqlState\":\"" + state + "\",\"phase\":\"" + phase + "\"}");
            System.exit(1);
        }
    }

    private static String run(String[] args) throws Exception {
        if (args.length != 3 || !Set.of("Info", "Validate", "Baseline").contains(args[0])) throw new Refused("INVALID_ACTION");
        String action = args[0];
        if (action.equals("Baseline") ? !args[2].equals("1") : !args[2].isEmpty()) throw new Refused("BASELINE_REQUIRES_VERSION_1");
        String url = System.getenv().getOrDefault("DB_URL", "jdbc:h2:file:./data/puppyruby;IFEXISTS=TRUE;DB_CLOSE_ON_EXIT=FALSE");
        String vendor = url.startsWith("jdbc:postgresql:") ? "postgresql" : url.startsWith("jdbc:h2:") ? "h2" : "";
        if (vendor.isEmpty()) throw new Refused("UNSUPPORTED_DATABASE");
        if (vendor.equals("h2")) {
            // Opening an H2 file must not create a database or run URL-embedded SQL during Info.
            String upper = url.toUpperCase(Locale.ROOT);
            if (upper.contains(";INIT=") || upper.contains(";IFEXISTS=FALSE")) throw new Refused("UNSAFE_H2_URL");
            if (!upper.contains(";IFEXISTS=TRUE")) url += ";IFEXISTS=TRUE";
        }
        String schema = System.getenv().getOrDefault("DB_SCHEMA", "").trim();
        boolean configuredSchema = !schema.isEmpty();
        if (configuredSchema) validateSchemaIdentifier(schema);
        String username = System.getenv().getOrDefault("DB_USERNAME", vendor.equals("h2") ? "sa" : "");
        String password = System.getenv().getOrDefault("DB_PASSWORD", "");
        DriverManager.setLoginTimeout(10);
        if (!configuredSchema) {
            phase = "default_schema";
            // Resolve the actual connection default, including a URL/role search_path. Never guess public.
            try (Connection connection = new SafeDataSource(url, username, password, null).getConnection()) {
                schema = connection.getSchema();
            }
            if (schema == null || schema.isBlank()) throw new Refused("DEFAULT_SCHEMA_UNRESOLVED");
            validateSchemaIdentifier(schema);
        }
        // All following connections, migrations and entity checks are pinned to this one schema.
        SafeDataSource source = new SafeDataSource(url, username, password, schema);
        phase = "inventory";
        Set<String> actual = inventory(source, schema);
        boolean historyPresent = actual.contains(HISTORY);
        phase = "flyway_configuration";
        var flyway = Flyway.configure().dataSource(source).defaultSchema(schema).schemas(schema)
            .locations("classpath:db/migration/" + vendor).createSchemas(false).baselineOnMigrate(false)
            .cleanDisabled(true).validateMigrationNaming(true).failOnMissingLocations(true).load();

        if (action.equals("Baseline")) {
            if (historyPresent) throw new Refused("HISTORY_ALREADY_EXISTS");
            if (!actual.equals(V1_TABLES)) throw new Refused("BASELINE_TABLE_SET_MISMATCH");
            phase = "entity_validation";
            validateEntities(source, schema, vendor, Path.of(args[1]), true);
            // Only this explicit action permits a write, after all read-only preflight checks pass.
            source.allowWrites = true;
            phase = "baseline";
            Flyway.configure().configuration(flyway.getConfiguration()).baselineVersion("1")
                .baselineDescription("Reviewed existing PuppyRuby schema").load().baseline();
            return "{\"success\":true,\"action\":\"Baseline\",\"vendor\":\"" + vendor + "\",\"baselineVersion\":1,\"appTables\":30}";
        }

        if (action.equals("Validate")) {
            if (!historyPresent) throw new Refused("HISTORY_NOT_REGISTERED");
            phase = "flyway_validation";
            var validation = flyway.validateWithResult();
            if (!validation.validationSuccessful) throw new Refused("MIGRATION_VALIDATION_FAILED");
            phase = "entity_validation";
            validateEntities(source, schema, vendor, Path.of(args[1]), false);
        }
        phase = "flyway_info";
        var info = flyway.info();
        return "{\"success\":true,\"action\":\"" + action + "\",\"vendor\":\"" + vendor
            + "\",\"historyPresent\":" + historyPresent + ",\"schemaTables\":" + actual.size()
            + ",\"installed\":" + info.applied().length + ",\"pending\":" + info.pending().length + "}";
    }

    private static void validateSchemaIdentifier(String schema) {
        if (!schema.matches("[A-Za-z_][A-Za-z0-9_]{0,62}")) throw new Refused("INVALID_SCHEMA_IDENTIFIER");
    }

    private static Set<String> inventory(DataSource source, String schema) throws SQLException {
        Set<String> tables = new HashSet<>();
        try (Connection connection = source.getConnection()) {
            boolean exists = false;
            try (ResultSet schemas = connection.getMetaData().getSchemas()) {
                while (schemas.next()) if (schema.equals(schemas.getString("TABLE_SCHEM"))) exists = true;
            }
            if (!exists) throw new Refused("SCHEMA_NOT_FOUND");
            try (ResultSet rows = connection.getMetaData().getTables(connection.getCatalog(), null, "%", null)) {
                while (rows.next()) if (schema.equals(rows.getString("TABLE_SCHEM"))) {
                    // PostgreSQL metadata includes indexes when types is null; views must still fail baseline preflight.
                    String type = rows.getString("TABLE_TYPE");
                    if ("INDEX".equals(type) || "PARTITIONED INDEX".equals(type)) continue;
                    String name = rows.getString("TABLE_NAME");
                    // Quoted mixed-case application tables are not the unquoted names used by V1.
                    String expected = connection.getMetaData().storesUpperCaseIdentifiers() ? name.toLowerCase(Locale.ROOT) : name;
                    if (!tables.add(expected)) throw new Refused("AMBIGUOUS_TABLE_NAMES");
                }
            }
        }
        return tables;
    }

    private static void validateEntities(DataSource source, String schema, String vendor, Path classes, boolean baseline) throws Exception {
        Map<String, Object> settings = new HashMap<>();
        settings.put("hibernate.connection.datasource", source);
        settings.put("hibernate.dialect", vendor.equals("h2") ? "org.hibernate.dialect.H2Dialect" : "org.hibernate.dialect.PostgreSQLDialect");
        settings.put("hibernate.boot.allow_jdbc_metadata_access", false);
        settings.put("hibernate.hbm2ddl.auto", "none");
        settings.put("hibernate.default_schema", '"' + schema + '"');
        var registry = new StandardServiceRegistryBuilder().applySettings(settings).build();
        try {
            var sources = new MetadataSources(registry);
            classes = classes.toAbsolutePath().normalize();
            try (var files = Files.walk(classes.resolve("com/puppyruby"))) {
                for (Path file : files.filter(path -> path.toString().endsWith(".class")).toList()) {
                    String name = classes.relativize(file).toString().replace('\\', '.').replace('/', '.').replaceFirst("\\.class$", "");
                    Class<?> type = Class.forName(name, false, DatabaseTool.class.getClassLoader());
                    if (type.isAnnotationPresent(Entity.class)) sources.addAnnotatedClass(type);
                }
            }
            Metadata metadata = sources.getMetadataBuilder().applyPhysicalNamingStrategy(new CamelCaseToUnderscoresNamingStrategy()).build();
            Set<String> mapped = new HashSet<>();
            metadata.getDatabase().getNamespaces().forEach(namespace -> namespace.getTables().forEach(table -> mapped.add(table.getName())));
            if (baseline && !mapped.equals(V1_TABLES)) throw new Refused("V1_ENTITY_MODEL_CHANGED");
            ExecutionOptions options = new ExecutionOptions() {
                public Map<String, Object> getConfigurationValues() { return settings; }
                public boolean shouldManageNamespaces() { return false; }
                public ExceptionHandler getExceptionHandler() { return exception -> { throw exception; }; }
            };
            registry.getService(SchemaManagementTool.class).getSchemaValidator(settings).doValidation(metadata, options, ContributableMatcher.ALL);
        } finally { StandardServiceRegistryBuilder.destroy(registry); }
    }

    private static final class SafeDataSource extends AbstractDataSource {
        final String url, username, password, schema;
        boolean allowWrites;
        SafeDataSource(String url, String username, String password, String schema) {
            this.url = url; this.username = username; this.password = password; this.schema = schema;
        }
        @Override public Connection getConnection() throws SQLException {
            String operation = phase;
            phase = operation + "_connect";
            Connection connection = DriverManager.getConnection(url, username, password);
            try {
                phase = operation + "_read_only";
                connection.setReadOnly(!allowWrites);
                phase = operation + "_select_schema";
                if (schema != null) connection.setSchema(schema);
                phase = operation;
                return connection;
            } catch (Throwable error) { connection.close(); throw error; }
        }
        // Management always uses its configured identity, including when a library supplies null overrides.
        @Override public Connection getConnection(String ignoredUsername, String ignoredPassword) throws SQLException { return getConnection(); }
    }

    private static final class Refused extends RuntimeException {
        final String code;
        Refused(String code) { this.code = code; }
    }
}
