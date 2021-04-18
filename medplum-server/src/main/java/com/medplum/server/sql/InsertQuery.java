package com.medplum.server.sql;

import java.util.ArrayList;
import java.util.List;

public class InsertQuery {
    private final String tableName;
    private final List<Parameter> values;

    private InsertQuery(final Builder builder) {
        this.tableName = builder.tableName;
        this.values = builder.values;
    }

    public String getTableName() {
        return tableName;
    }

    public List<Parameter> getValues() {
        return values;
    }

    public static class Builder {
        private final String tableName;
        private final List<Parameter> values;

        public Builder(final String tableName) {
            this.tableName = tableName;
            this.values = new ArrayList<>();
        }

        public Builder value(final String columnName, final Object value, final int valueType) {
            this.values.add(new Parameter(columnName, value, valueType));
            return this;
        }

        public InsertQuery build() {
            return new InsertQuery(this);
        }
    }
}
