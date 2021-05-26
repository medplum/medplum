package com.medplum.server.fhir.r4.repo.jdbc;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import jakarta.json.JsonArray;
import jakarta.json.JsonObject;
import jakarta.json.JsonValue;
import jakarta.json.JsonValue.ValueType;

import com.medplum.fhir.r4.FhirPropertyNames;
import com.medplum.fhir.r4.types.FhirList;
import com.medplum.fhir.r4.types.HumanName;
import com.medplum.fhir.r4.types.SearchParameter;
import com.medplum.server.fhir.r4.search.Filter;
import com.medplum.server.sql.Column;
import com.medplum.server.sql.ColumnType;
import com.medplum.server.sql.CreateTableQuery;
import com.medplum.server.sql.DeleteQuery;
import com.medplum.server.sql.InsertQuery;
import com.medplum.server.sql.Operator;
import com.medplum.server.sql.SelectQuery;
import com.medplum.util.HumanNameComparator;
import com.medplum.util.HumanNameFormatter;

class HumanNameTable implements LookupTable {
    private static final String TABLE_NAME = "HUMANNAME";
    private static final String COLUMN_ID = "ID";
    private static final String COLUMN_RESOURCE_ID = "RESOURCEID";
    private static final String COLUMN_NAME = "NAME";
    private static final String COLUMN_GIVEN = "GIVEN";
    private static final String COLUMN_FAMILY = "FAMILY";
    private final Connection conn;

    HumanNameTable(final Connection conn) {
        this.conn = conn;
    }

    @Override
    public void createTables() throws SQLException {
        new CreateTableQuery(TABLE_NAME)
                .column(COLUMN_ID, ColumnType.uuid().notNull().primaryKey())
                .column(COLUMN_RESOURCE_ID, ColumnType.uuid().notNull())
                .column(COLUMN_NAME, ColumnType.varchar(128))
                .column(COLUMN_GIVEN, ColumnType.varchar(64))
                .column(COLUMN_FAMILY, ColumnType.varchar(64))
                .index(COLUMN_RESOURCE_ID)
                .index(COLUMN_NAME)
                .index(COLUMN_GIVEN)
                .index(COLUMN_FAMILY)
                .execute(conn);
    }

    @Override
    public void indexResource(final UUID resourceId, final JsonObject resource) throws SQLException {
        if (!resource.containsKey(FhirPropertyNames.PROPERTY_NAME)) {
            return;
        }

        final JsonValue name = resource.get(FhirPropertyNames.PROPERTY_NAME);
        if (name == null || name.getValueType() != ValueType.ARRAY) {
            return;
        }

        final var incoming = new ArrayList<>(new FhirList<>(HumanName.class, (JsonArray) name));
        final var existing = getNames(resourceId);

        if (!compareNames(incoming, existing)) {
            new DeleteQuery(TABLE_NAME)
                    .condition(COLUMN_RESOURCE_ID, Operator.EQUALS, resourceId, Types.BINARY)
                    .execute(conn);

            for (final HumanName incomingName : incoming) {
                new InsertQuery(TABLE_NAME)
                        .value(COLUMN_ID, UUID.randomUUID(), Types.BINARY)
                        .value(COLUMN_RESOURCE_ID, resourceId, Types.BINARY)
                        .value(COLUMN_NAME, HumanNameFormatter.format(incomingName), Types.VARCHAR)
                        .value(COLUMN_GIVEN, HumanNameFormatter.formatGiven(incomingName), Types.VARCHAR)
                        .value(COLUMN_FAMILY, incomingName.family(), Types.VARCHAR)
                        .execute(conn);
            }
        }
    }

    @Override
    public boolean isIndexed(final SearchParameter searchParam) {
        final var id = searchParam.id();
        return id.equals("individual-given") ||
                id.equals("individual-family") ||
                id.equals("Patient-name") ||
                id.equals("Person-name") ||
                id.equals("Practitioner-name") ||
                id.equals("RelatedPerson-name");
    }

    @Override
    public void addSearchConditions(final SelectQuery selectQuery, final Filter filter) {
        selectQuery.join(TABLE_NAME, COLUMN_ID, COLUMN_RESOURCE_ID);

        final var code = filter.getSearchParam().code();
        final String columnName;
        if (code.equals("name")) {
            columnName = COLUMN_NAME;
        } else if (code.equals("given")) {
            columnName = COLUMN_GIVEN;
        } else if (code.equals("family")) {
            columnName = COLUMN_FAMILY;
        } else {
            throw new IllegalArgumentException("Unexpected search param (code=" + code + ")");
        }

        selectQuery.condition(
                new Column(TABLE_NAME, columnName),
                Operator.LIKE,
                "%" + filter.getValue() + "%",
                Types.VARCHAR);
    }

    private List<HumanName> getNames(final UUID resourceId) throws SQLException {
        return new SelectQuery(TABLE_NAME)
                .column(COLUMN_NAME)
                .column(COLUMN_GIVEN)
                .column(COLUMN_FAMILY)
                .condition(COLUMN_RESOURCE_ID, Operator.EQUALS, resourceId, Types.BINARY)
                .execute(conn, rs -> HumanName.create()
                        .given(Arrays.asList(rs.getString(1).split(" ")))
                        .family(rs.getString(2))
                        .build());
    }

    private boolean compareNames(final List<HumanName> incoming, final List<HumanName> existing) {
        if (incoming.size() != existing.size()) {
            return false;
        }

        incoming.sort(HumanNameComparator.INSTANCE);
        existing.sort(HumanNameComparator.INSTANCE);

        for (var i = 0; i < incoming.size(); i++) {
            if (!HumanNameFormatter.formatAll(incoming.get(i)).equals(HumanNameFormatter.formatAll(existing.get(i)))) {
                return false;
            }
        }

        return true;
    }
}
