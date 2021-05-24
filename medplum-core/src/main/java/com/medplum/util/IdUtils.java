package com.medplum.util;

import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;

public class IdUtils {

    IdUtils() {
        throw new UnsupportedOperationException();
    }

    /**
     * Generates an ID string.
     * All Medplum IDs are version 4 UUIDs.
     * @return ID string.
     */
    public static String generateId() {
        return UUID.randomUUID().toString();
    }

    /**
     * Converts a UUID to a 16-element byte array.
     *
     * @param id The UUID.
     * @return The 16-element byte array.
     */
    public static byte[] toBytes(final UUID id) {
        if (id == null) {
            return null; // NOSONAR - Must be null for JDBC
        }

        final var buffer = new byte[16];
        final var bb = ByteBuffer.wrap(buffer);
        bb.putLong(id.getMostSignificantBits());
        bb.putLong(id.getLeastSignificantBits());
        return buffer;
    }

    /**
     * Converts a byte array to a UUID.
     *
     * @param b The byte array.
     * @return The new UUID.
     */
    public static UUID fromBytes(final byte[] b) {
        if (b == null || b.length != 16) {
            return null;
        }

        final var bb = ByteBuffer.wrap(b);
        return new UUID(bb.getLong(), bb.getLong());
    }

    /**
     * Tries to parse a UUID string.
     * Returns null on failure.
     *
     * @param id The UUID string.
     * @return The UUID on success; null on failure.
     */
    public static UUID tryParseId(final String id) {
        if (id == null || id.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(id);
        } catch (final IllegalArgumentException ex) {
            return null;
        }
    }

    /**
     * Generates a cryptographically-secure string.
     * Can be used for OAuth2 client secrets.
     * @return A secure string.
     */
    public static String generateSecret() {
        // From: https://www.oauth.com/oauth2-servers/client-registration/client-id-secret/
        // A great way to generate a secure secret is to use a cryptographically-secure
        // library to generate a 256-bit value and converting it to a hexadecimal representation.
        // 256 bits = 32 bytes
        final var random = new SecureRandom();
        final var bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }
}
