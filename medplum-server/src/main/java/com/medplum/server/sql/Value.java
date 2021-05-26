package com.medplum.server.sql;

public class Value {
    private final String columnName;
    private final Parameter parameter;

    public Value(final String columnName, final Parameter parameter) {
        this.columnName = columnName;
        this.parameter = parameter;
    }

    public String getColumnName() {
        return columnName;
    }

    public Parameter getParameter() {
        return parameter;
    }
}
