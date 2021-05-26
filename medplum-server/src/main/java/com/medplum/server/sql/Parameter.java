package com.medplum.server.sql;

public class Parameter {
    private final Object value;
    private final int valueType;

    public Parameter(final Object value, final int valueType) {
        this.value = value;
        this.valueType = valueType;
    }

    public Object getValue() {
        return value;
    }

    public int getValueType() {
        return valueType;
    }
}
