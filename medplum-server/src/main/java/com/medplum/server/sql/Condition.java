package com.medplum.server.sql;

public class Condition {
    private final String columnName;
    private final Operator operator;
    private final Parameter parameter;

    public Condition(final String columnName, final Operator operator, final Parameter parameter) {
        this.columnName = columnName;
        this.operator = operator;
        this.parameter = parameter;
    }

    public String getColumnName() {
        return columnName;
    }

    public Operator getOperator() {
        return operator;
    }

    public Parameter getParameter() {
        return parameter;
    }
}
