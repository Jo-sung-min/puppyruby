package com.puppyruby.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.boot.flyway.autoconfigure.FlywayConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The same explicitly configured schema is used by migrations, ORM statements and native SQL. */
@Configuration(proxyBeanMethods = false)
public class DatabaseSchemaConfiguration {
    static String schema(String value) {
        if (value == null || value.isBlank()) return null;
        String result = value.trim();
        if (!result.matches("[A-Za-z_][A-Za-z0-9_]{0,62}"))
            throw new IllegalArgumentException("DB_SCHEMA must be a schema identifier of at most 63 ASCII letters, digits or underscores.");
        return result;
    }

    @Bean
    static BeanPostProcessor databaseSchemaDataSource(@Value("${DB_SCHEMA:}") String configured) {
        String schema = schema(configured);
        return new BeanPostProcessor() {
            @Override public Object postProcessBeforeInitialization(Object bean, String name) {
                if (schema != null && bean instanceof HikariDataSource source) source.setSchema(schema);
                return bean;
            }
        };
    }

    @Bean
    HibernatePropertiesCustomizer databaseSchemaHibernate(@Value("${DB_SCHEMA:}") String configured) {
        String schema = schema(configured);
        // Quoting keeps a mixed-case schema identical to the JDBC connection's schema.
        return properties -> { if (schema != null) properties.put("hibernate.default_schema", '"' + schema + '"'); };
    }

    @Bean
    FlywayConfigurationCustomizer databaseSchemaFlyway(@Value("${DB_SCHEMA:}") String configured) {
        String schema = schema(configured);
        return configuration -> { if (schema != null) configuration.schemas(schema).defaultSchema(schema); };
    }
}
