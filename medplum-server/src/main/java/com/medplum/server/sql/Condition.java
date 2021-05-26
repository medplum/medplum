package com.medplum.server.sql;

public class Condition {
    private final Column column;
    private final Operator operator;
    private final Parameter parameter;

    public Condition(final Column column, final Operator operator, final Parameter parameter) {
        this.column = column;
        this.operator = operator;
        this.parameter = parameter;
    }

    public Column getColumn() {
        return column;
    }

    public Operator getOperator() {
        return operator;
    }

    public Parameter getParameter() {
        return parameter;
    }
}
