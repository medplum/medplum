package com.medplum.fhir.r4.types;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.util.AbstractMap;
import java.util.Collection;
import java.util.Objects;
import java.util.Set;
import java.util.function.BiConsumer;
import java.util.function.BiFunction;
import java.util.function.Function;

import jakarta.json.Json;
import jakarta.json.JsonArray;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonNumber;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;

import com.medplum.util.JsonUtils;

public abstract class FhirObject extends AbstractMap<String, JsonValue> implements JsonObject {
    protected final JsonObject data;

    public static <T> T create(final Class<T> c, final JsonObject data) {
        try {
            return c.getConstructor(JsonObject.class).newInstance(data);
        } catch (final ReflectiveOperationException ex) {
            throw new RuntimeException(ex.getMessage(), ex);
        }
    }

    public static <T extends FhirObject> JsonArray toArray(final java.util.List<T> list) {
        final JsonArrayBuilder b = Json.createArrayBuilder();
        for (final T element : list) {
            b.add(element);
        }
        return b.build();
    }

    public static JsonArray toStringArray(final java.util.List<String> list) {
        final JsonArrayBuilder b = Json.createArrayBuilder();
        for (final String element : list) {
            b.add(element);
        }
        return b.build();
    }

    public static JsonArray toIntegerArray(final java.util.List<Integer> list) {
        final JsonArrayBuilder b = Json.createArrayBuilder();
        for (final Integer element : list) {
            b.add(element);
        }
        return b.build();
    }

    public static JsonArray toDoubleArray(final java.util.List<Double> list) {
        final JsonArrayBuilder b = Json.createArrayBuilder();
        for (final Double element : list) {
            b.add(element);
        }
        return b.build();
    }

    public static JsonArray toUriArray(final java.util.List<URI> list) {
        final JsonArrayBuilder b = Json.createArrayBuilder();
        for (final URI element : list) {
            b.add(element.toString());
        }
        return b.build();
    }

    public static JsonArray toInstantArray(final java.util.List<Instant> list) {
        final JsonArrayBuilder b = Json.createArrayBuilder();
        for (final Instant element : list) {
            b.add(element.toString());
        }
        return b.build();
    }

    public static JsonArray toJsonObjectArray(final java.util.List<JsonObject> list) {
        final JsonArrayBuilder b = Json.createArrayBuilder();
        for (final JsonObject element : list) {
            b.add(element);
        }
        return b.build();
    }

    protected FhirObject(final JsonObject data) {
        this.data = Objects.requireNonNull(data);
    }

    public <T> T getObject(final Class<T> c, final String name) {
        final JsonValue value = data.get(name);
        return value == null || value.getValueType() != ValueType.OBJECT ? null : FhirObject.create(c, (JsonObject) value);
    }

    public <T> java.util.List<T> getList(final Class<T> c, final String name) {
        final JsonValue value = data.get(name);
        return value == null || value.getValueType() != ValueType.ARRAY ? null : new FhirList<>(c, (JsonArray) value);
    }

    @Override
    public String getString(final String name) {
        // Note that this changes the default behavior
        // By default, getString(name) throws an exception on property not found.
        // We change it to return null instaed.
        return data.getString(name, null);
    }

    public URI getUri(final String name) {
        final String str = data.getString(name, null);
        return str == null ? null : URI.create(str);
    }

    public Instant getInstant(final String name) {
        final String str = data.getString(name, null);
        return str == null ? null : Instant.parse(str);
    }

    public LocalDate getLocalDate(final String name) {
        final String str = data.getString(name, null);
        return str == null ? null : LocalDate.parse(str);
    }

    /*
     * Delegate methods
     */

    @Override
    public JsonValue getValue(final String jsonPointer) {
        return data.getValue(jsonPointer);
    }

    @Override
    public ValueType getValueType() {
        return data.getValueType();
    }

    @Override
    public JsonObject asJsonObject() {
        return data.asJsonObject();
    }

    @Override
    public JsonArray asJsonArray() {
        return data.asJsonArray();
    }

    @Override
    public String toString() {
        return data.toString();
    }

    @Override
    public JsonArray getJsonArray(final String name) {
        return data.getJsonArray(name);
    }

    @Override
    public JsonObject getJsonObject(final String name) {
        return data.getJsonObject(name);
    }

    @Override
    public JsonNumber getJsonNumber(final String name) {
        return data.getJsonNumber(name);
    }

    @Override
    public JsonString getJsonString(final String name) {
        return data.getJsonString(name);
    }

    @Override
    public String getString(final String name, final String defaultValue) {
        return data.getString(name, defaultValue);
    }

    @Override
    public int getInt(final String name) {
        return data.getInt(name);
    }

    @Override
    public int getInt(final String name, final int defaultValue) {
        return data.getInt(name, defaultValue);
    }

    @Override
    public boolean getBoolean(final String name) {
        return data.getBoolean(name);
    }

    @Override
    public int size() {
        return data.size();
    }

    @Override
    public boolean getBoolean(final String name, final boolean defaultValue) {
        return data.getBoolean(name, defaultValue);
    }

    @Override
    public boolean containsKey(final Object key) {
        return data.containsKey(key);
    }

    @Override
    public boolean isNull(final String name) {
        return data.isNull(name);
    }

    @Override
    public JsonValue get(final Object key) {
        return data.get(key);
    }

    @Override
    public Set<String> keySet() {
        return data.keySet();
    }

    @Override
    public Collection<JsonValue> values() {
        return data.values();
    }

    @Override
    public Set<Entry<String, JsonValue>> entrySet() {
        return data.entrySet();
    }

    @Override
    public boolean equals(final Object o) {
        return data.equals(o);
    }

    @Override
    public int hashCode() {
        return data.hashCode();
    }

    @Override
    public JsonValue getOrDefault(final Object key, final JsonValue defaultValue) {
        return data.getOrDefault(key, defaultValue);
    }

    @Override
    public void forEach(final BiConsumer<? super String, ? super JsonValue> action) {
        data.forEach(action);
    }

    @Override
    public void replaceAll(final BiFunction<? super String, ? super JsonValue, ? extends JsonValue> function) {
        data.replaceAll(function);
    }

    @Override
    public JsonValue putIfAbsent(final String key, final JsonValue value) {
        return data.putIfAbsent(key, value);
    }

    @Override
    public boolean remove(final Object key, final Object value) {
        return data.remove(key, value);
    }

    @Override
    public boolean replace(final String key, final JsonValue oldValue, final JsonValue newValue) {
        return data.replace(key, oldValue, newValue);
    }

    @Override
    public JsonValue replace(final String key, final JsonValue value) {
        return data.replace(key, value);
    }

    @Override
    public JsonValue computeIfAbsent(final String key, final Function<? super String, ? extends JsonValue> mappingFunction) {
        return data.computeIfAbsent(key, mappingFunction);
    }

    @Override
    public JsonValue computeIfPresent(final String key, final BiFunction<? super String, ? super JsonValue, ? extends JsonValue> remappingFunction) {
        return data.computeIfPresent(key, remappingFunction);
    }

    @Override
    public JsonValue compute(final String key, final BiFunction<? super String, ? super JsonValue, ? extends JsonValue> remappingFunction) {
        return data.compute(key, remappingFunction);
    }

    @Override
    public JsonValue merge(
            final String key,
            final JsonValue value,
            final BiFunction<? super JsonValue, ? super JsonValue, ? extends JsonValue> remappingFunction) {
        return data.merge(key, value, remappingFunction);
    }

    public static class Builder<T extends FhirObject, B extends FhirObject.Builder<T, B>> {
        protected final JsonObjectBuilder b;

        protected Builder() {
            b = Json.createObjectBuilder();
        }

        protected Builder(final JsonObject data) {
            b = Json.createObjectBuilder(data);
        }

        public B copyAll(final T other) {
            JsonUtils.copyProperties(other, b);
            return getBuilder();
        }

        @SuppressWarnings("unchecked")
        protected B getBuilder() {
            return (B) this;
        }
    }
}
