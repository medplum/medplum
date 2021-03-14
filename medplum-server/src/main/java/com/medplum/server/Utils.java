package com.medplum.server;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class Utils {

    Utils() {
        throw new UnsupportedOperationException();
    }

    public static String buildAuthHeader(final String username, final String password) {
        return "Basic " + Base64.getEncoder().encodeToString((username + ":" + password).getBytes(StandardCharsets.UTF_8));
    }

    public static KeyValue<String, String> parseAuthHeader(final String authHeader) {
        if (authHeader == null) {
            return null;
        }

        final String[] parts = authHeader.split(" ", 2);
        if (parts.length != 2 || !parts[0].equalsIgnoreCase("Basic")) {
            return null;
        }

        final String[] parts2 = new String(Base64.getDecoder().decode(parts[1])).split(":", 2);
        if (parts2.length != 2) {
            return null;
        }

        return new KeyValue<>(parts2[0], parts2[1]);
    }

    public static class KeyValue<K, V> {
        private final K key;
        private final V value;

        public KeyValue(final K key, final V value) {
            this.key = key;
            this.value = value;
        }

        public K getKey() {
            return key;
        }

        public V getValue() {
            return value;
        }
    }
}
