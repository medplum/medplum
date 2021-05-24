package com.medplum.fhir.r4;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

import jakarta.json.JsonValue;
import jakarta.json.JsonValue.ValueType;

public class FhirPath {
    private final String original;
    private final String[][] components;

    public FhirPath(final String str) {
        original = str;

        final String[] expressions = str.split(" \\| ");
        this.components = new String[expressions.length][];
        for (var i = 0; i < expressions.length; i++) {
            this.components[i] = expressions[i].split("\\.");
        }
    }

    public List<JsonValue> eval(final JsonValue jsonObject) {
        final List<JsonValue> result = new ArrayList<>();
        for (final String[] component : components) {
            result.addAll(evalExpression(jsonObject, component));
        }
        return result;
    }

    private List<JsonValue> evalExpression(final JsonValue jsonObject, final String[] expression) {
        List<JsonValue> curr = Collections.singletonList(jsonObject);

        for (final String token : expression) {
            final List<JsonValue> next = new ArrayList<>();
            for (final JsonValue jsonValue : curr) {
                evalToken(jsonValue, token, next);
            }
            curr = next;
        }

        return curr;
    }

    private static void evalToken(final JsonValue jsonValue, final String token, final List<JsonValue> next) {
        if (jsonValue == null) {
            return;
        }

        final var valueType = jsonValue.getValueType();

        if (valueType == ValueType.OBJECT) {
            final var obj = jsonValue.asJsonObject();
            if (Objects.equals(obj.getString("resourceType", null), token)) {
                next.add(obj);
            } else {
                next.add(obj.get(token));
            }

        } else if (valueType == ValueType.ARRAY) {
            if (isInteger(token)) {
                next.add(jsonValue.asJsonArray().get(Integer.parseInt(token)));
            } else {
                for (final JsonValue child : jsonValue.asJsonArray()) {
                    evalToken(child, token, next);
                }
            }
        }
    }

    public JsonValue evalFirst(final JsonValue jsonObject) {
        final List<JsonValue> values = eval(jsonObject);
        return values.isEmpty() ? JsonValue.NULL : values.get(0);
    }

    @Override
    public String toString() {
        return original;
    }

    private static boolean isInteger(final String s) {
        if (s.isEmpty()) {
            return false;
        }
        for (var i = 0; i < s.length(); i++) {
            if (i == 0 && s.charAt(i) == '-') {
                if (s.length() == 1) {
                    return false;
                }
            } else if (Character.digit(s.charAt(i), 10) < 0) {
                return false;
            }
        }
        return true;
    }
}
