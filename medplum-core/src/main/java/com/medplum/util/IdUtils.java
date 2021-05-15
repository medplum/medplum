package com.medplum.util;

import java.nio.ByteBuffer;
import java.util.UUID;

public class IdUtils {

    IdUtils() {
        throw new UnsupportedOperationException();
    }

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

}
