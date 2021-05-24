package com.medplum.util;

import static org.junit.jupiter.api.Assertions.*;

import java.util.UUID;

import org.junit.Test;

public class IdUtilsTest {

    @Test
    public void testCtor() {
        assertThrows(UnsupportedOperationException.class, IdUtils::new);
    }

    @Test
    public void testGenerateId() {
        final String id = IdUtils.generateId();
        assertNotNull(id);

        final UUID uuid = UUID.fromString(id);
        assertNotNull(uuid);
    }

    @Test
    public void testGenerateSecret() {
        final String secret = IdUtils.generateSecret();
        assertNotNull(secret);
        assertEquals(44, secret.length());
    }
}
