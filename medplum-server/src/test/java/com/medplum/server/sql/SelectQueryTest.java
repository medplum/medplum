package com.medplum.server.sql;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Types;
import java.util.Arrays;

import org.junit.Test;

public class SelectQueryTest {

    @Test
    public void testSelect() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("foo", "bar", "baz"), results);
        }
    }

    @Test
    public void testSelectWhereEquals() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .condition("ID", Operator.EQUALS, 2, Types.INTEGER)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("bar"), results);
        }
    }

    @Test
    public void testSelectWhereNotEquals() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .condition("ID", Operator.NOT_EQUALS, 2, Types.INTEGER)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("foo", "baz"), results);
        }
    }

    @Test
    public void testSelectWhereGreaterThan() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .condition("ID", Operator.GREATER_THAN, 2, Types.INTEGER)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("baz"), results);
        }
    }

    @Test
    public void testSelectWhereGreaterThanOrEquals() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .condition("ID", Operator.GREATER_THAN_OR_EQUALS, 2, Types.INTEGER)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("bar", "baz"), results);
        }
    }

    @Test
    public void testSelectWhereLessThan() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .condition("ID", Operator.LESS_THAN, 2, Types.INTEGER)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("foo"), results);
        }
    }

    @Test
    public void testSelectWhereLessThanOrEquals() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .condition("ID", Operator.LESS_THAN_OR_EQUALS, 2, Types.INTEGER)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("foo", "bar"), results);
        }
    }

    @Test
    public void testSelectWhereLike() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .condition("NAME", Operator.LIKE, "ba%", Types.VARCHAR)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("bar", "baz"), results);
        }
    }

    @Test
    public void testSelectWhereNotLike() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .condition("NAME", Operator.NOT_LIKE, "ba%", Types.VARCHAR)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("foo"), results);
        }
    }

    @Test
    public void testSelectOrderByAscending() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .orderBy("NAME", false)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("bar", "baz", "foo"), results);
        }
    }

    @Test
    public void testSelectOrderByDescending() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .orderBy("NAME", true)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("foo", "baz", "bar"), results);
        }
    }

    @Test
    public void testSelectLimit() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .limit(2)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("foo", "bar"), results);
        }
    }

    @Test
    public void testSelectOffset() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .offset(1)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("bar", "baz"), results);
        }
    }

    @Test
    public void testSelectLimitOffset() throws SQLException {
        try (final var conn = getConnection()) {
            final var results = new SelectQuery("WIDGET")
                    .column("NAME")
                    .limit(1)
                    .offset(1)
                    .execute(getConnection(), rs -> rs.getString(1));

            assertEquals(Arrays.asList("bar"), results);
        }
    }

    private static Connection getConnection() throws SQLException {
        final var conn = DriverManager.getConnection("jdbc:h2:mem:;MODE=PostgreSQL");

        try (final var stmt = conn.createStatement()) {
            stmt.executeUpdate("CREATE TABLE WIDGET (ID INT NOT NULL PRIMARY KEY, NAME VARCHAR(128))");
            stmt.executeUpdate("INSERT INTO WIDGET (ID, NAME) VALUES (1, 'foo')");
            stmt.executeUpdate("INSERT INTO WIDGET (ID, NAME) VALUES (2, 'bar')");
            stmt.executeUpdate("INSERT INTO WIDGET (ID, NAME) VALUES (3, 'baz')");
        }

        return conn;
    }
}
