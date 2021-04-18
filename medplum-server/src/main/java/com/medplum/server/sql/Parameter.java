package com.medplum.server.sql;

public class Parameter {
    private final String columnName;
    private final Object value;
    private final int valueType;

    public Parameter(final String columnName, final Object value, final int valueType) {
        this.columnName = columnName;
        this.value = value;
        this.valueType = valueType;
    }

    public String getColumnName() {
        return columnName;
    }

    public Object getValue() {
        return value;
    }

    public int getValueType() {
        return valueType;
    }
}
