import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;

/** Real, separate-connection Flyway regression check; never reads application environment files. */
public final class FlywayAccessCheck {
    private static final String URL = "jdbc:postgresql://127.0.0.1:15439/postgres?sslmode=disable&connectTimeout=5&socketTimeout=20";
    private static final String USER = "flyway_check";

    public static void main(String[] args) throws Exception {
        if (!"1".equals(System.getenv("PUPPY_TEST_ISOLATED")) || args.length != 1) {
            throw new IllegalArgumentException("Explicit isolated-test flag and migration directory required");
        }
        String location = "filesystem:" + Path.of(args[0]).toAbsolutePath().normalize();
        try (Connection admin = DriverManager.getConnection(URL, USER, "")) {
            require("127.0.0.1|15439|postgres|flyway_check".equals(value(admin,
                "SELECT host(inet_server_addr())||'|'||inet_server_port()||'|'||current_database()||'|'||current_user")), "Local identity mismatch");
            List<String> createdRoles = new ArrayList<>();
            try {
                for (String role : List.of("anon", "authenticated")) {
                    if (number(admin, "SELECT count(*) FROM pg_roles WHERE rolname='" + role + "'") == 0) {
                        execute(admin, "CREATE ROLE " + role + " NOLOGIN NOSUPERUSER NOBYPASSRLS");
                        createdRoles.add(role);
                    }
                    require(number(admin, "SELECT count(*) FROM pg_roles WHERE rolname='" + role + "' AND (rolsuper OR rolbypassrls)") == 0,
                        "Browser fixture roles must not bypass RLS");
                }
                verify(admin, location, false);
                verify(admin, location, true);
            } finally {
                for (String role : createdRoles) execute(admin, "DROP ROLE " + role);
            }
            System.out.println("REAL_FLYWAY_ACCESS_OK fresh=2 upgrade=1 repeat=0 protected=31 denied=248 owner=31 cleanup=true");
        }
    }

    private static void verify(Connection admin, String location, boolean upgrade) throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String schema = "puppyruby_flyway_access_" + suffix;
        String owner = "puppyruby_flyway_owner_" + suffix;
        boolean roleCreated = false, schemaCreated = false;
        try {
            execute(admin, "CREATE ROLE " + owner + " NOLOGIN NOSUPERUSER NOBYPASSRLS");
            roleCreated = true;
            execute(admin, "CREATE SCHEMA " + schema + " AUTHORIZATION " + owner);
            schemaCreated = true;
            execute(admin, "GRANT USAGE ON SCHEMA " + schema + " TO PUBLIC, anon, authenticated");
            execute(admin, "ALTER DEFAULT PRIVILEGES FOR ROLE " + owner + " IN SCHEMA " + schema
                + " GRANT ALL ON TABLES TO PUBLIC, anon, authenticated");
            if (upgrade) {
                require(configuration(location, schema, owner).target("1").load().migrate().migrationsExecuted == 1,
                    "V1 fixture did not migrate");
                require(number(admin, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace"
                    + " WHERE n.nspname='" + schema + "' AND c.relkind='r' AND c.relrowsecurity") == 1,
                    "afterMigrate must protect history after V1");
            }
            Flyway flyway = configuration(location, schema, owner).load();
            require(flyway.migrate().migrationsExecuted == (upgrade ? 1 : 2), "Migration count mismatch");
            flyway.validate();
            verifyAccess(admin, schema, owner);
            require(flyway.migrate().migrationsExecuted == 0, "Repeat migrate must not reapply versioned SQL");
            verifyAccess(admin, schema, owner);
            require(number(admin, "SELECT count(*) FROM " + schema + ".flyway_schema_history WHERE success AND version IN ('1','2')") == 2,
                "Successful V1/V2 history missing");
        } finally {
            execute(admin, "RESET ROLE");
            if (schemaCreated) execute(admin, "DROP SCHEMA " + schema + " CASCADE");
            if (roleCreated) execute(admin, "DROP ROLE " + owner);
        }
        require(number(admin, "SELECT count(*) FROM pg_namespace WHERE nspname='" + schema + "'") == 0,
            "Test schema cleanup failed");
        require(number(admin, "SELECT count(*) FROM pg_roles WHERE rolname='" + owner + "'") == 0,
            "Test role cleanup failed");
    }

    private static FluentConfiguration configuration(String location, String schema, String owner) {
        return Flyway.configure().dataSource(URL, USER, "").locations(location).schemas(schema).defaultSchema(schema)
            .createSchemas(false).cleanDisabled(true).baselineOnMigrate(false).validateMigrationNaming(true)
            .initSql("SET ROLE " + owner + "; SET statement_timeout=15000; SET lock_timeout=3000");
    }

    private static void verifyAccess(Connection admin, String schema, String owner) throws Exception {
        List<String[]> tables = new ArrayList<>();
        try (Statement statement = admin.createStatement(); ResultSet result = statement.executeQuery(
            "SELECT c.relname,(SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1)"
            + " FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='" + schema + "' AND c.relkind='r'")) {
            while (result.next()) tables.add(new String[]{result.getString(1), result.getString(2)});
        }
        require(tables.size() == 31, "Expected 30 app tables and Flyway history");
        require(number(admin, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='"
            + schema + "' AND c.relkind='r' AND c.relrowsecurity") == 31, "RLS protection incomplete");
        execute(admin, "SET ROLE " + owner);
        try {
            for (String[] table : tables) number(admin, "SELECT count(*) FROM " + schema + "." + table[0]);
        } finally { execute(admin, "RESET ROLE"); }
        int denied = 0;
        for (String role : List.of("anon", "authenticated")) {
            execute(admin, "SET ROLE " + role);
            try {
                for (String[] table : tables) {
                    String name = schema + "." + table[0];
                    for (String sql : List.of("SELECT count(*) FROM " + name, "INSERT INTO " + name + " DEFAULT VALUES",
                        "UPDATE " + name + " SET " + table[1] + "=" + table[1] + " WHERE false", "DELETE FROM " + name + " WHERE false")) {
                        try { execute(admin, sql); throw new AssertionError("Browser operation unexpectedly allowed"); }
                        catch (SQLException expected) {
                            require("42501".equals(expected.getSQLState()), "Unexpected SQL error during browser check");
                            denied++;
                        }
                    }
                }
            } finally { execute(admin, "RESET ROLE"); }
        }
        require(denied == 248, "Browser denial count mismatch");
    }

    private static void execute(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement()) { statement.execute(sql); }
    }
    private static String value(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery(sql)) {
            if (!result.next()) throw new AssertionError("Missing SQL result");
            return result.getString(1);
        }
    }
    private static int number(Connection connection, String sql) throws SQLException { return Integer.parseInt(value(connection, sql)); }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
}
