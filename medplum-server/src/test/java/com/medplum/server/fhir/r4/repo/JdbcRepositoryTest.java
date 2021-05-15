package com.medplum.server.fhir.r4.repo;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.Test;

import com.medplum.fhir.types.CodeableConcept;
import com.medplum.fhir.types.Observation;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.server.BaseTest;
import com.medplum.server.security.SecurityUser;

public class JdbcRepositoryTest extends BaseTest {

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
