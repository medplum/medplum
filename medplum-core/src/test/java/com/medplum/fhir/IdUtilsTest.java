package com.medplum.fhir;

import static org.junit.jupiter.api.Assertions.*;

import java.util.UUID;

import org.junit.Test;

public class IdUtilsTest {

    @Test
    public void testCtor() {
        assertThrows(UnsupportedOperationException.class, () -> new IdUtils());
    }

    @Test
    public void testGenerateId() {
        final String id = IdUtils.generateId();
        assertNotNull(id);

        final UUID uuid = UUID.fromString(id);
        assertNotNull(uuid);
    }
}
