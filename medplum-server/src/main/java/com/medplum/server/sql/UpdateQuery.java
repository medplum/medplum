package com.medplum.server.sql;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class UpdateQuery {
    private static final Logger LOG = LoggerFactory.getLogger(UpdateQuery.class);
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

    public int execute(final Connection conn) throws SQLException {
        try (final SqlBuilder sql = new SqlBuilder(conn)) {
            sql.append("UPDATE ");
            sql.appendIdentifier(tableName);
            sql.append(" SET ");

            boolean first = true;
            for (final Parameter value : values) {
                if (!first) {
                    sql.append(",");
                }
                sql.appendIdentifier(value.getColumnName());
                sql.append("=?");
                first = false;
            }

            first = true;
            for (final Parameter condition : conditions) {
                if (first) {
                    sql.append(" WHERE ");
                } else {
                    sql.append(" AND ");
                }
                sql.appendIdentifier(condition.getColumnName());
                sql.append("=?");
                first = false;
            }

            LOG.debug("{}", sql);

            try (final PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
                int i = 1;
                for (final Parameter value : values) {
                    stmt.setObject(i++, value.getValue(), value.getValueType());
                }
                for (final Parameter condition : conditions) {
                    stmt.setObject(i++, condition.getValue(), condition.getValueType());
                }
                return stmt.executeUpdate();
            }
        }
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
