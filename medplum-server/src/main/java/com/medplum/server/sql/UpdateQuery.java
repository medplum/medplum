package com.medplum.server.sql;

import java.util.ArrayList;
import java.util.List;

public class UpdateQuery {
    private final String tableName;
    private final List<Parameter> values;
    private final List<Parameter> conditions;

    private UpdateQuery(final Builder builder) {
        this.tableName = builder.tableName;
        this.values = builder.values;
        this.conditions = builder.conditions;
    }

    public String getTableName() {
        return tableName;
    }

    public List<Parameter> getValues() {
        return values;
    }

    public List<Parameter> getConditions() {
        return conditions;
    }

    public static class Builder {
        private final String tableName;
        private final List<Parameter> values;
        private final List<Parameter> conditions;

        public Builder(final String tableName) {
            this.tableName = tableName;
            this.values = new ArrayList<>();
            this.conditions = new ArrayList<>();
        }

        public Builder value(final String columnName, final Object value, final int valueType) {
            this.values.add(new Parameter(columnName, value, valueType));
            return this;
        }

        public Builder condition(final String columnName, final Object value, final int valueType) {
            this.conditions.add(new Parameter(columnName, value, valueType));
            return this;
        }

        public UpdateQuery build() {
            return new UpdateQuery(this);
        }
    }
}
