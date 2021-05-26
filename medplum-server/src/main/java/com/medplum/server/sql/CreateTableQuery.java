package com.medplum.server.sql;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CreateTableQuery {
    private static final Logger LOG = LoggerFactory.getLogger(CreateTableQuery.class);
    private final String tableName;
    private final List<ColumnDefinition> columns;
    private final List<String> indexes;

    private CreateTableQuery(final Builder builder) {
        this.tableName = builder.tableName;
        this.columns = builder.columns;
        this.indexes = builder.indexes;
    }

    public String getTableName() {
        return tableName;
    }

    public List<ColumnDefinition> getColumns() {
        return columns;
    }

    public List<String> getIndexes() {
        return indexes;
    }

    public void execute(final Connection conn) throws SQLException {
        try (final var sql = new SqlBuilder(conn)) {
            sql.append("CREATE TABLE IF NOT EXISTS ");
            sql.appendIdentifier(tableName);
            sql.append(" (");

            var first = true;
            for (final var column : columns) {
                if (!first) {
                    sql.append(",");
                }
                sql.appendIdentifier(column.getColumnName());
                sql.append(" ");
                sql.append(column.getColumnType());
                first = false;
            }

            sql.append(")");
            LOG.debug("{}", sql);

            try (final var stmt = conn.createStatement()) {
                stmt.executeUpdate(sql.toString());
            }
        }

        for (final var index : indexes) {
            try (final var sql = new SqlBuilder(conn)) {
                sql.append("CREATE INDEX ON");
                sql.appendIdentifier(tableName);
                sql.append(" (");
                sql.appendIdentifier(index);
                sql.append(")");

                LOG.debug("{}", sql);

                try (final Statement stmt = conn.createStatement()) {
                    stmt.executeUpdate(sql.toString());
                }
            }
        }
    }

    public static class ColumnDefinition {
        private final String columnName;
        private final String columnType;

        public ColumnDefinition(final String columnName, final String columnType) {
            this.columnName = columnName;
            this.columnType = columnType;
        }

        public String getColumnName() {
            return columnName;
        }

        public String getColumnType() {
            return columnType;
        }
    }

    public static class Builder {
        private final String tableName;
        private final List<ColumnDefinition> columns;
        private final List<String> indexes;

        public Builder(final String tableName) {
            this.tableName = tableName;
            this.columns = new ArrayList<>();
            this.indexes = new ArrayList<>();
        }

        public Builder column(final String columnName, final String columnType) {
            this.columns.add(new ColumnDefinition(columnName, columnType));
            return this;
        }

        public Builder index(final String columnName) {
            this.indexes.add(columnName);
            return this;
        }

        public CreateTableQuery build() {
            return new CreateTableQuery(this);
        }
    }
}
