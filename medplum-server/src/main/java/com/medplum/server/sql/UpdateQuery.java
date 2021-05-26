package com.medplum.server.sql;

import java.sql.Connection;
import java.sql.SQLException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class UpdateQuery extends BaseQuery<UpdateQuery> {
    private static final Logger LOG = LoggerFactory.getLogger(UpdateQuery.class);

    public UpdateQuery(final String tableName) {
        super(tableName);
    }

    public int execute(final Connection conn) throws SQLException {
        try (final var sql = new SqlBuilder(conn)) {
            sql.append("UPDATE ");
            sql.appendIdentifier(tableName);
            sql.append(" SET ");

            var first = true;
            for (final var value : values) {
                if (!first) {
                    sql.append(",");
                }
                sql.appendIdentifier(value.getColumnName());
                sql.append("=?");
                first = false;
            }

            this.buildConditions(sql);

            LOG.debug("{}", sql);

            try (final var stmt = conn.prepareStatement(sql.toString())) {
                int i = 1;
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
