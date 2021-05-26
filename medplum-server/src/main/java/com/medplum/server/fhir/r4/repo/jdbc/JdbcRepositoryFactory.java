package com.medplum.server.fhir.r4.repo.jdbc;

import java.sql.SQLException;

import javax.sql.DataSource;

import jakarta.inject.Inject;

import org.glassfish.hk2.api.Factory;
import org.glassfish.jersey.server.CloseableService;

import com.medplum.server.sse.SseService;

/**
 * JdbcRepositoryFactory creates JdbcRepository instances.
 * There should be one instance per request.
 * This is unfortunately necessary to properly close the database connection.
 * See: https://stackoverflow.com/a/20200903
 */
public class JdbcRepositoryFactory implements Factory<JdbcRepository> {
    private final DataSource dataSource;
    private final SseService sseService;
    private final CloseableService closeableService;

    @Inject
    public JdbcRepositoryFactory(
            final DataSource dataSource,
            final SseService sseService,
            final CloseableService closeableService) {
        this.dataSource = dataSource;
        this.sseService = sseService;
        this.closeableService = closeableService;
    }

    @Override
    public JdbcRepository provide() {
        try {
            final var repo = new JdbcRepository(dataSource.getConnection(), sseService);
            closeableService.add(repo);
            return repo;
        } catch (final SQLException e) {
            throw new RuntimeException(e.getMessage(), e);
        }
    }

    @Override
    public void dispose(final JdbcRepository instance) {
        // Do nothing
        // The JdbcRepository is closed by the CloseableService
        // See: https://stackoverflow.com/a/20200538
    }
}
