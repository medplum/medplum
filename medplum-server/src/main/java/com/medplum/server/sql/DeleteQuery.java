package com.medplum.server.sql;

import java.sql.Connection;
import java.sql.SQLException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class DeleteQuery extends BaseQuery<DeleteQuery> {
    private static final Logger LOG = LoggerFactory.getLogger(DeleteQuery.class);

    public DeleteQuery(final String tableName) {
        super(tableName);
    }

    public int execute(final Connection conn) throws SQLException {
        try (final var sql = new SqlBuilder(conn)) {
            sql.append("DELETE FROM ");
            sql.appendIdentifier(tableName);

            buildConditions(sql);

            LOG.debug("{}", sql);

            try (final var stmt = conn.prepareStatement(sql.toString())) {
                var i = 1;
                for (final Condition condition : conditions) {
                    stmt.setObject(i++, condition.getParameter().getValue(), condition.getParameter().getValueType());
                }
                return stmt.executeUpdate();
            }
        }
    }
}
