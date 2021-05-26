package com.medplum.server.sql;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

public abstract class BaseQuery<T extends BaseQuery<T>> {
    protected final String tableName;
    protected final List<Value> values;
    protected final List<Condition> conditions;

    public BaseQuery(final String tableName) {
        this.tableName = tableName;
        this.values = new ArrayList<>();
        this.conditions = new ArrayList<>();
    }

    @SuppressWarnings("unchecked")
    public T value(final String columnName, final Object value, final int valueType) {
        values.add(new Value(columnName, new Parameter(value, valueType)));
        return (T) this;
    }

    @SuppressWarnings("unchecked")
    public T condition(final String columnName, final Operator operator, final Object value, final int valueType) {
        conditions.add(new Condition(new Column(columnName), operator, new Parameter(value, valueType)));
        return (T) this;
    }

    @SuppressWarnings("unchecked")
    public T condition(final Column column, final Operator operator, final Object value, final int valueType) {
        conditions.add(new Condition(column, operator, new Parameter(value, valueType)));
        return (T) this;
    }

    protected void buildConditions(final SqlBuilder sql) throws SQLException {
        var first = true;
        for (final var condition : conditions) {
            if (first) {
                sql.append(" WHERE ");
            } else {
                sql.append(" AND ");
            }

            sql.appendColumn(condition.getColumn());

            switch (condition.getOperator()) {
            case EQUALS:
                sql.append("=");
                break;
            case GREATER_THAN:
                sql.append(">");
                break;
            case GREATER_THAN_OR_EQUALS:
                sql.append(">=");
                break;
            case LESS_THAN:
                sql.append("<");
                break;
            case LESS_THAN_OR_EQUALS:
                sql.append("<=");
                break;
            case LIKE:
                sql.append(" LIKE ");
                break;
            case NOT_EQUALS:
                sql.append("<>");
                break;
            case NOT_LIKE:
                sql.append(" NOT LIKE ");
                break;
            }

            sql.append("?");
            first = false;
        }
    }
}
