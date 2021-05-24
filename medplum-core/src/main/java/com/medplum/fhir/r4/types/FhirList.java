package com.medplum.fhir.r4.types;

import java.time.Instant;
import java.util.AbstractList;
import java.util.List;

import jakarta.json.JsonArray;
import jakarta.json.JsonNumber;
import jakarta.json.JsonObject;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;

public class FhirList<T> extends AbstractList<T> implements List<T> {
    private final Class<T> c;
    private final JsonArray array;

    public FhirList(final Class<T> c, final JsonArray array) {
        this.c = c;
        this.array = array;
    }

    @Override
    @SuppressWarnings("unchecked")
    public T get(final int index) {
        final JsonValue value = array.get(index);
        if (value == null) {
            return null;
        }

        if (FhirObject.class.isAssignableFrom(c)) {
            return FhirObject.create(c, (JsonObject) value);

        } else if (c == Double.class) {
            return (T) ((Double) ((JsonNumber) value).doubleValue());

        } else if (c == Instant.class) {
            return (T) Instant.parse(((JsonString) value).getString());

        } else if (c == Integer.class) {
            return (T) ((Integer) ((JsonNumber) value).intValue());

        } else if (c == JsonObject.class) {
            return (T) value;

        } else if (c == String.class) {
            return (T) ((JsonString) value).getString();

        } else {
            throw new RuntimeException("Unsupported FhirList element type: " + c);
        }
    }

    @Override
    public int size() {
        if (array == null) {
            return 0;
        }
        return array.size();
    }
}
