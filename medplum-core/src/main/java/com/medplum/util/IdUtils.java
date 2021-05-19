package com.medplum.util;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.UUID;

public class IdUtils {
    private static final byte[] HEX_ARRAY = "0123456789ABCDEF".getBytes(StandardCharsets.US_ASCII);

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

        final byte[] buffer = new byte[16];
        final ByteBuffer bb = ByteBuffer.wrap(buffer);
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

        final ByteBuffer bb = ByteBuffer.wrap(b);
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
        final SecureRandom random = new SecureRandom();
        final byte bytes[] = new byte[128];
        random.nextBytes(bytes);
        return bytesToHex(bytes);
    }

    /**
     * Converts a byte array to a hexadecimal string.
     * Source: https://stackoverflow.com/a/9855338
     * @param bytes Input byte array.
     * @return Hexadecimal string output.
     */
    private static String bytesToHex(final byte[] bytes) {
        final byte[] hexChars = new byte[bytes.length * 2];
        for (int j = 0; j < bytes.length; j++) {
            final int v = bytes[j] & 0xFF;
            hexChars[j * 2] = HEX_ARRAY[v >>> 4];
            hexChars[j * 2 + 1] = HEX_ARRAY[v & 0x0F];
        }
        return new String(hexChars, StandardCharsets.UTF_8);
    }
}
