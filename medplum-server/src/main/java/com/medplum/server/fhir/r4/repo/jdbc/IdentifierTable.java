package com.medplum.server.fhir.r4.repo.jdbc;

import java.net.URI;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import jakarta.json.JsonArray;
import jakarta.json.JsonObject;
import jakarta.json.JsonValue;
import jakarta.json.JsonValue.ValueType;

import com.medplum.fhir.r4.FhirPropertyNames;
import com.medplum.fhir.r4.types.FhirList;
import com.medplum.fhir.r4.types.Identifier;
import com.medplum.fhir.r4.types.SearchParameter;
import com.medplum.server.fhir.r4.search.Filter;
import com.medplum.server.sql.Column;
import com.medplum.server.sql.ColumnType;
import com.medplum.server.sql.CreateTableQuery;
import com.medplum.server.sql.DeleteQuery;
import com.medplum.server.sql.InsertQuery;
import com.medplum.server.sql.Operator;
import com.medplum.server.sql.SelectQuery;
import com.medplum.util.IdentifierComparator;

class IdentifierTable implements LookupTable {
    private static final String TABLE_NAME = "IDENTIFIER";
    private static final String COLUMN_ID = "ID";
    private static final String COLUMN_RESOURCE_ID = "RESOURCEID";
    private static final String COLUMN_SYSTEM = "SYSTEM";
    private static final String COLUMN_VALUE = "VALUE";
    private static final String SEARCH_PARAM_CODE_IDENTIFIER = "identifier";
    private static final String SEARCH_PARAM_TYPE_TOKEN = "token";
    private final Connection conn;

    IdentifierTable(final Connection conn) {
        this.conn = conn;
    }

    @Override
    public void createTables() throws SQLException {
        new CreateTableQuery(TABLE_NAME)
                .column(COLUMN_ID, ColumnType.uuid().notNull().primaryKey())
                .column(COLUMN_RESOURCE_ID, ColumnType.uuid().notNull())
                .column(COLUMN_SYSTEM, ColumnType.varchar(128))
                .column(COLUMN_VALUE, ColumnType.varchar(128))
                .index(COLUMN_RESOURCE_ID)
                .index(COLUMN_SYSTEM)
                .index(COLUMN_VALUE)
                .execute(conn);
    }

    @Override
    public void indexResource(final UUID resourceId, final JsonObject resource) throws SQLException {
        if (!resource.containsKey(FhirPropertyNames.PROPERTY_IDENTIFIER)) {
            return;
        }

        final JsonValue identifier = resource.get(FhirPropertyNames.PROPERTY_IDENTIFIER);
        if (identifier == null || identifier.getValueType() != ValueType.ARRAY) {
            return;
        }

        final var incoming = new ArrayList<>(new FhirList<>(Identifier.class, (JsonArray) identifier));
        final var existing = getIdentifiers(resourceId);

        if (!compareIdentifiers(incoming, existing)) {
            new DeleteQuery(TABLE_NAME)
                    .condition(COLUMN_RESOURCE_ID, Operator.EQUALS, resourceId, Types.BINARY)
                    .execute(conn);

            for (final Identifier incomingId : incoming) {
                new InsertQuery(TABLE_NAME)
                        .value(COLUMN_ID, UUID.randomUUID(), Types.BINARY)
                        .value(COLUMN_RESOURCE_ID, resourceId, Types.BINARY)
                        .value(COLUMN_SYSTEM, incomingId.system().toString(), Types.VARCHAR)
                        .value(COLUMN_VALUE, incomingId.value(), Types.VARCHAR)
                        .execute(conn);
            }
        }
    }

    @Override
    public boolean isIndexed(final SearchParameter searchParam) {
      return searchParam.code().equals(SEARCH_PARAM_CODE_IDENTIFIER) &&
              searchParam.type().equals(SEARCH_PARAM_TYPE_TOKEN);
    }

    @Override
    public void addSearchConditions(final SelectQuery selectQuery, final Filter filter) {
        selectQuery.join(TABLE_NAME, COLUMN_ID, COLUMN_RESOURCE_ID);
        selectQuery.condition(
                new Column(TABLE_NAME, COLUMN_VALUE),
                Operator.EQUALS,
                filter.getValue(),
                Types.VARCHAR);
    }

    private List<Identifier> getIdentifiers(final UUID resourceId) throws SQLException {
        return new SelectQuery(TABLE_NAME)
                .column(COLUMN_SYSTEM)
                .column(COLUMN_VALUE)
                .condition(COLUMN_RESOURCE_ID, Operator.EQUALS, resourceId, Types.BINARY)
                .execute(conn, rs -> Identifier.create()
                        .system(URI.create(rs.getString(1)))
                        .value(rs.getString(2))
                        .build());
    }

    private boolean compareIdentifiers(final List<Identifier> incoming, final List<Identifier> existing) {
        if (incoming.size() != existing.size()) {
            return false;
        }

        incoming.sort(IdentifierComparator.INSTANCE);
        existing.sort(IdentifierComparator.INSTANCE);

        for (var i = 0; i < incoming.size(); i++) {
            final var incomingId = incoming.get(i);
            final var existingId = existing.get(i);
            if (!incomingId.system().equals(existingId.system()) || !incomingId.value().equals(existingId.value())) {
                return false;
            }
        }

        return true;
    }
}
