package com.medplum.server.sql;

import java.sql.Connection;
import java.sql.SQLException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class InsertQuery extends BaseQuery<InsertQuery> {
    private static final Logger LOG = LoggerFactory.getLogger(InsertQuery.class);

    public InsertQuery(final String tableName) {
        super(tableName);
    }

    public int execute(final Connection conn) throws SQLException {
        try (final var sql = new SqlBuilder(conn)) {
            sql.append("INSERT INTO ");
            sql.appendIdentifier(tableName);
            sql.append(" (");

            var first = true;
            for (final var value : values) {
                if (!first) {
                    sql.append(",");
                }
                sql.appendIdentifier(value.getColumnName());
                first = false;
            }

            sql.append(") VALUES (");

            for (var i = 0; i < values.size(); i++) {
                if (i > 0) {
                    sql.append(",");
                }
                sql.append("?");
            }

            sql.append(")");

            LOG.debug("{}", sql);

            try (final var stmt = conn.prepareStatement(sql.toString())) {
                var i = 1;
                for (final var value : values) {
                    stmt.setObject(i++, value.getParameter().getValue(), value.getParameter().getValueType());
                }
                for (final var condition : conditions) {
                    stmt.setObject(i++, condition.getParameter().getValue(), condition.getParameter().getValueType());
                }
                return stmt.executeUpdate();
            }
        }
    }
}
