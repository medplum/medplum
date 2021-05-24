package com.medplum.server.sql;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class InsertQuery {
    private static final Logger LOG = LoggerFactory.getLogger(InsertQuery.class);
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

    public int execute(final Connection conn) throws SQLException {
        try (final SqlBuilder sql = new SqlBuilder(conn)) {
            sql.append("INSERT INTO ");
            sql.appendIdentifier(tableName);
            sql.append(" (");

            boolean first = true;
            for (final Parameter value : values) {
                if (!first) {
                    sql.append(",");
                }
                sql.appendIdentifier(value.getColumnName());
                first = false;
            }

            sql.append(") VALUES (");

            for (int i = 0; i < values.size(); i++) {
                if (i > 0) {
                    sql.append(",");
                }
                sql.append("?");
            }

            sql.append(")");

            LOG.debug("{}", sql);

            try (final PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
                int i = 1;
                for (final Parameter value : values) {
                    LOG.debug("  {} = {} (len={})", i, value.getValue(), Objects.toString(value.getValue()).length());
                    if (value.getValueType() == Types.VARCHAR) {
                        stmt.setString(i++, (String) value.getValue());
                    } else {
                        stmt.setObject(i++, value.getValue(), value.getValueType());
                    }
                }
                return stmt.executeUpdate();
            }
        }
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
