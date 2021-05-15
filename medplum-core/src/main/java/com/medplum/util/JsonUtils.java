package com.medplum.util;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;
import jakarta.json.stream.JsonParser;

public class JsonUtils {

    public static JsonObject readJsonFile(final File file) {
        try (final InputStream in = new FileInputStream(file)) {
            return readJsonInputStream(in);
        } catch (final IOException ex) {
            throw new RuntimeException(ex);
        }
    }

    public static JsonObject readJsonResourceFile(final String resourceName) {
        try (final InputStream in = JsonUtils.class.getClassLoader().getResourceAsStream(resourceName)) {
            return readJsonInputStream(in);
        } catch (final IOException ex) {
            throw new RuntimeException(ex);
        }
    }

    public static JsonObject readJsonInputStream(final InputStream inputStream) {
        try (final JsonParser parser = Json.createParser(inputStream)) {
            parser.next();
            return parser.getObject();
        }
    }

    public static JsonObject readJsonString(final String str) {
        try (final JsonReader reader = Json.createReader(new StringReader(str))) {
            return reader.readObject();
        }
    }
}
