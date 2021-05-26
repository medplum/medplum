package com.medplum.server.sql;

public class OrderBy {
    private final Column column;
    private final boolean descending;

    public OrderBy(final Column column, final boolean descending) {
        this.column = column;
        this.descending = descending;
    }

    public Column getColumn() {
        return column;
    }

    public boolean isDescending() {
        return descending;
    }
}
