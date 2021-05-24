package com.medplum.util;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;

public class JsonUtils {

    JsonUtils() {
        throw new UnsupportedOperationException();
    }

    public static JsonObject readJsonFile(final File file) {
        try (final var in = new FileInputStream(file)) {
            return readJsonInputStream(in);
        } catch (final IOException ex) {
            throw new RuntimeException(ex);
        }
    }

    public static JsonObject readJsonResourceFile(final String resourceName) {
        try (final var in = JsonUtils.class.getClassLoader().getResourceAsStream(resourceName)) {
            return readJsonInputStream(in);
        } catch (final IOException ex) {
            throw new RuntimeException(ex);
        }
    }

    public static JsonObject readJsonInputStream(final InputStream inputStream) {
        try (final var parser = Json.createParser(inputStream)) {
            parser.next();
            return parser.getObject();
        }
    }

    public static JsonObject readJsonString(final String str) {
        try (final var reader = Json.createReader(new StringReader(str))) {
            return reader.readObject();
        }
    }

    /**
     * Copies all properties from the source JsonObject to the destination JsonObjectBuilder.
     * @param src The source JsonObject.
     * @param dest The destination JsonObjectBuilder.
     */
    public static void copyProperties(final JsonObject src, final JsonObjectBuilder dest) {
        src.forEach(dest::add);
    }
}
