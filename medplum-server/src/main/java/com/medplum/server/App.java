package com.medplum.server;

import java.sql.SQLException;
import java.util.Map;
import java.util.TimeZone;

import javax.sql.DataSource;

import jakarta.ws.rs.core.Configuration;

import org.glassfish.hk2.utilities.binding.AbstractBinder;
import org.glassfish.jersey.jsonb.JsonBindingFeature;
import org.glassfish.jersey.jsonp.JsonProcessingFeature;
import org.glassfish.jersey.process.internal.RequestScoped;
import org.glassfish.jersey.server.ResourceConfig;
import org.glassfish.jersey.server.ServerProperties;
import org.glassfish.jersey.server.mvc.mustache.MustacheMvcFeature;
import org.jose4j.jwk.JsonWebKeySet;
import org.jose4j.keys.resolvers.JwksVerificationKeyResolver;
import org.jose4j.keys.resolvers.VerificationKeyResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.r4.FhirFeature;
import com.medplum.server.fhir.r4.repo.BinaryStorage;
import com.medplum.server.fhir.r4.repo.FileSystemBinaryStorage;
import com.medplum.server.fhir.r4.repo.JdbcRepository;
import com.medplum.server.fhir.r4.repo.JdbcRepositoryFactory;
import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.security.JwkManager;
import com.medplum.server.security.OAuthService;
import com.medplum.server.services.DebugEmailService;
import com.medplum.server.services.EmailService;
import com.medplum.server.sse.LocalSseTransport;
import com.medplum.server.sse.SseService;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

/**
 * The App class represents the JAX-RS Application configuration.
 */
public class App extends ResourceConfig {
    private static final Logger LOG = LoggerFactory.getLogger(App.class);
    private final SseService sseService;
    private final DataSource dataSource;
    private final JsonWebKeySet jwks;
    private final JwksVerificationKeyResolver keyResolver;
    private final Configuration config;

    public App(final Map<String, Object> properties) throws Exception {
        // Prefer IPv4
        System.setProperty("java.net.preferIPv4Stack", "true");

        // Need to allow CORS headers to be sent
        System.setProperty("sun.net.http.allowRestrictedHeaders", "true");

        // Use UTC by default
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));

        // Jersey config settings
        property(ServerProperties.WADL_FEATURE_DISABLE, "true");
        property(MustacheMvcFeature.TEMPLATE_BASE_PATH, "templates");
        register(MustacheMvcFeature.class);
        register(JsonProcessingFeature.class);
        register(JsonBindingFeature.class);
        register(FhirFeature.class);

        // Pass all config properties to Jersey
        addProperties(properties);

        sseService = new SseService(new LocalSseTransport());

        // Init Hikari and the JDBC DataSource
        dataSource = initDataSource(properties);

        // Initialize the database
        // Initialize JWKS while we have the database open
        try (final var repo = getRepo()) {
            repo.createTables();
            jwks = JwkManager.initKeys(repo);
        }

        keyResolver = new JwksVerificationKeyResolver(jwks.getJsonWebKeys());

        register(new AbstractBinder() {
            @Override
            protected void configure() {
                bind(sseService).to(SseService.class);
                bind(dataSource).to(DataSource.class);
                bind(jwks).to(JsonWebKeySet.class);
                bind(keyResolver).to(VerificationKeyResolver.class);
                bindFactory(JdbcRepositoryFactory.class).to(Repository.class).in(RequestScoped.class);
                bind(FileSystemBinaryStorage.class).to(BinaryStorage.class);
                bind(DebugEmailService.class).to(EmailService.class);
                bind(OAuthService.class).to(OAuthService.class).in(RequestScoped.class);
            }
        });

        packages("com.medplum.server");

        config = getConfiguration();
    }

    DataSource initDataSource(final Map<String, Object> properties) throws ReflectiveOperationException {
        final var hikariConfig = new HikariConfig();

        final var driverClassName = (String) properties.get(ConfigSettings.JDBC_DRIVER_CLASS_NAME);
        if (driverClassName != null && !driverClassName.isBlank()) {
            LOG.info("Force database driver class: {}", driverClassName);
            Class.forName(driverClassName);
            hikariConfig.setDriverClassName(driverClassName);
        }

        hikariConfig.setJdbcUrl((String) properties.get(ConfigSettings.JDBC_URL));
        hikariConfig.setUsername((String) properties.get(ConfigSettings.JDBC_USERNAME));
        hikariConfig.setPassword((String) properties.get(ConfigSettings.JDBC_PASSWORD));
        hikariConfig.setMaximumPoolSize(10);
        hikariConfig.setAutoCommit(true);
        hikariConfig.addDataSourceProperty("cachePrepStmts", "true");
        hikariConfig.addDataSourceProperty("prepStmtCacheSize", "250");
        hikariConfig.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");

        return new HikariDataSource(hikariConfig);
    }

    JdbcRepository getRepo() {
        try {
            return new JdbcRepository(dataSource.getConnection(), sseService);
        } catch (final SQLException e) {
            throw new RuntimeException(e.getMessage(), e);
        }
    }

    OAuthService getOAuth() {
        return new OAuthService(config, getRepo(), jwks, keyResolver);
    }
}
