package com.medplum.server.sql;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class SelectQuery extends BaseQuery<SelectQuery> {
    private static final Logger LOG = LoggerFactory.getLogger(SelectQuery.class);
    private final List<String> columns;
    private final List<Join> joins;
    private final List<OrderBy> orderBys;
    private int limit;
    private int offset;

    public SelectQuery(final String tableName) {
        super(tableName);
        this.columns = new ArrayList<>();
        this.joins = new ArrayList<>();
        this.orderBys = new ArrayList<>();
    }

    public SelectQuery column(final String column) {
        columns.add(column);
        return this;
    }

    public SelectQuery join(final String rightTableName, final String leftColumnName, final String rightColumnName) {
        joins.add(new Join(new Column(tableName, leftColumnName), new Column(rightTableName, rightColumnName)));
        return this;
    }

    public SelectQuery orderBy(final String columnName, final boolean descending) {
        orderBys.add(new OrderBy(new Column(columnName), descending));
        return this;
    }

    public SelectQuery limit(final int limit) {
        this.limit = limit;
        return this;
    }

    public SelectQuery offset(final int offset) {
        this.offset = offset;
        return this;
    }

    public <T> List<T> execute(final Connection conn, final RowMapper<T> rowMapper) throws SQLException {
        try (final var sql = new SqlBuilder(conn)) {
            sql.append("SELECT ");

            var first = true;
            for (final var column : columns) {
                if (!first) {
                    sql.append(", ");
                }
                sql.appendIdentifier(column);
                first = false;
            }

            sql.append(" FROM ");
            sql.appendIdentifier(tableName);

            for (final var join : joins) {
                sql.append(" JOIN ");
                sql.appendIdentifier(join.getRight().getTableName());
                sql.append(" ON ");
                sql.appendColumn(join.getLeft());
                sql.append("=");
                sql.appendColumn(join.getRight());
            }

            this.buildConditions(sql);

            first = true;
            for (final var orderBy : orderBys) {
                if (first) {
                    sql.append(" ORDER BY ");
                } else {
                    sql.append(", ");
                }
                sql.appendColumn(orderBy.getColumn());
                if (orderBy.isDescending()) {
                    sql.append(" DESC");
                }
                first = false;
            }

            if (limit > 0) {
                sql.append(" LIMIT ");
                sql.append(limit);
            }

            if (offset > 0) {
                sql.append(" OFFSET ");
                sql.append(offset);
            }

            LOG.debug("{}", sql);

            try (final var stmt = conn.prepareStatement(sql.toString())) {
                var i = 1;
                for (final var condition : conditions) {
                    stmt.setObject(i++, condition.getParameter().getValue(), condition.getParameter().getValueType());
                }

                try (final var rs = stmt.executeQuery()) {
                    final var result = new ArrayList<T>();
                    while (rs.next()) {
                        result.add(rowMapper.apply(rs));
                    }
                    return result;
                }
            }
        }
    }
}
