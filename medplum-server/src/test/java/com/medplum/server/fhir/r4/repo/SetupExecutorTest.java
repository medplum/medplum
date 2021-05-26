package com.medplum.server.fhir.r4.repo;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

import org.junit.Test;

import com.medplum.server.BaseTest;
import com.medplum.server.fhir.r4.repo.jdbc.JdbcRepository;
import com.medplum.server.sse.LocalSseTransport;
import com.medplum.server.sse.SseService;

public class SetupExecutorTest extends BaseTest {

    @Test
    public void testSetup() {
        try (final var repo = getRepo()) {
            final var outcome = new SetupExecutor(repo).setup();
            assertTrue(outcome.isOk());
        }
    }

    @Test
    public void testSetupCleanDatabase() throws SQLException {
        try (final var conn = getConnection();
                final var repo = new JdbcRepository(conn, new SseService(new LocalSseTransport()))) {

            repo.createTables();

            final var outcome = new SetupExecutor(repo).setup();
            assertTrue(outcome.isOk());
        }
    }

    @Test
    public void testSetupCleanDatabaseTwice() throws SQLException {
        try (final var conn = getConnection();
                final var repo = new JdbcRepository(conn, new SseService(new LocalSseTransport()))) {

            repo.createTables();

            final var outcome1 = new SetupExecutor(repo).setup();
            assertTrue(outcome1.isOk());

            final var outcome2 = new SetupExecutor(repo).setup();
            assertFalse(outcome2.isOk());
        }
    }

    private static Connection getConnection() throws SQLException {
        return DriverManager.getConnection("jdbc:h2:mem:;MODE=PostgreSQL");
    }
}
