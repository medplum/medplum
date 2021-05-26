package com.medplum.server.sql;

public class ColumnType {
    private final StringBuilder b;

    private ColumnType(final String initial) {
        b = new StringBuilder();
        b.append(initial);
    }

    public static ColumnType uuid() {
        return new ColumnType("UUID");
    }

    public static ColumnType timestamp() {
        return new ColumnType("TIMESTAMP");
    }

    public static ColumnType text() {
        return new ColumnType("TEXT");
    }

    public static ColumnType varchar(final int length) {
        final var result = new ColumnType("VARCHAR");
        result.b.append('(');
        result.b.append(length);
        result.b.append(')');
        return result;
    }

    public ColumnType notNull() {
        b.append(" NOT NULL");
        return this;
    }

    public ColumnType primaryKey() {
        b.append(" PRIMARY KEY");
        return this;
    }

    @Override
    public String toString() {
        return b.toString();
    }
}
