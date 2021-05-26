package com.medplum.server.sql;

public class Column {
    private final String tableName;
    private final String columnName;

    public Column(final String tableName, final String columnName) {
        this.tableName = tableName;
        this.columnName = columnName;
    }

    public Column(final String columnName) {
        this.tableName = null;
        this.columnName = columnName;
    }

    public String getTableName() {
        return tableName;
    }

    public String getColumnName() {
        return columnName;
    }
}
