package com.medplum.server.fhir.r4.repo;

import static org.junit.jupiter.api.Assertions.*;

import java.util.UUID;

import org.junit.Test;

import com.medplum.fhir.r4.types.CodeableConcept;
import com.medplum.fhir.r4.types.Observation;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.fhir.r4.types.Patient;
import com.medplum.server.BaseTest;
import com.medplum.server.security.SecurityUser;

public class JdbcRepositoryTest extends BaseTest {

    @Test
    public void testReadUnknownResourceType() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome readOutcome = repo.read(SecurityUser.SYSTEM_USER, "DoesNotExist", UUID.randomUUID().toString());
            assertNotNull(readOutcome);
            assertFalse(readOutcome.isOk());
        }
    }

    @Test
    public void testReadNullId() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome readOutcome = repo.read(SecurityUser.SYSTEM_USER, Patient.RESOURCE_TYPE, null);
            assertNotNull(readOutcome);
            assertFalse(readOutcome.isOk());
        }
    }

    @Test
    public void testReadBlankId() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome readOutcome = repo.read(SecurityUser.SYSTEM_USER, Patient.RESOURCE_TYPE, "");
            assertNotNull(readOutcome);
            assertFalse(readOutcome.isOk());
        }
    }

    @Test
    public void testReadNonUuidId() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome readOutcome = repo.read(SecurityUser.SYSTEM_USER, Patient.RESOURCE_TYPE, "123");
            assertNotNull(readOutcome);
            assertFalse(readOutcome.isOk());
        }
    }

    @Test
    public void testReadHistoryUnknownResourceType() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome readOutcome = repo.readHistory(SecurityUser.SYSTEM_USER, "DoesNotExist", UUID.randomUUID().toString());
            assertNotNull(readOutcome);
            assertFalse(readOutcome.isOk());
        }
    }

    @Test
    public void testReadHistoryNullId() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome readOutcome = repo.readHistory(SecurityUser.SYSTEM_USER, Patient.RESOURCE_TYPE, null);
            assertNotNull(readOutcome);
            assertFalse(readOutcome.isOk());
        }
    }

    @Test
    public void testReadHistoryBlankId() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome readOutcome = repo.readHistory(SecurityUser.SYSTEM_USER, Patient.RESOURCE_TYPE, "");
            assertNotNull(readOutcome);
            assertFalse(readOutcome.isOk());
        }
    }

    @Test
    public void testReadHistoryNonUuidId() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome readOutcome = repo.readHistory(SecurityUser.SYSTEM_USER, Patient.RESOURCE_TYPE, "123");
            assertNotNull(readOutcome);
            assertFalse(readOutcome.isOk());
        }
    }

    @Test
    public void testReadVersionUnknownResourceType() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome readOutcome = repo.readVersion(SecurityUser.SYSTEM_USER, "DoesNotExist", UUID.randomUUID().toString(), UUID.randomUUID().toString());
            assertNotNull(readOutcome);
            assertFalse(readOutcome.isOk());
        }
    }

    @Test
    public void testReadVersionNullId() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome readOutcome = repo.readVersion(SecurityUser.SYSTEM_USER, Patient.RESOURCE_TYPE, UUID.randomUUID().toString(), null);
            assertNotNull(readOutcome);
            assertFalse(readOutcome.isOk());
        }
    }

    @Test
    public void testReadVersionBlankId() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome readOutcome = repo.readVersion(SecurityUser.SYSTEM_USER, Patient.RESOURCE_TYPE, UUID.randomUUID().toString(), "");
            assertNotNull(readOutcome);
            assertFalse(readOutcome.isOk());
        }
    }

    @Test
    public void testReadVersionNonUuidId() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome readOutcome = repo.readVersion(SecurityUser.SYSTEM_USER, Patient.RESOURCE_TYPE, UUID.randomUUID().toString(), "123");
            assertNotNull(readOutcome);
            assertFalse(readOutcome.isOk());
        }
    }

    @Test
    public void testReadWrite() {
        try (final JdbcRepository repo = getRepo()) {
            final OperationOutcome createOutcome = repo.create(
                    SecurityUser.SYSTEM_USER,
                    Observation.create()
                            .code(CodeableConcept.create().build())
                            .valueString("test")
                            .build());

            assertNotNull(createOutcome);
            assertTrue(createOutcome.isOk());

            final Observation obs = createOutcome.resource(Observation.class);
            assertNotNull(obs);

            final OperationOutcome readOutcome = repo.read(
                    SecurityUser.SYSTEM_USER,
                    Observation.RESOURCE_TYPE,
                    obs.id());

            assertNotNull(readOutcome);
            assertTrue(readOutcome.isOk());

            final Observation check = readOutcome.resource(Observation.class);
            assertNotNull(check);
        }
    }
}
