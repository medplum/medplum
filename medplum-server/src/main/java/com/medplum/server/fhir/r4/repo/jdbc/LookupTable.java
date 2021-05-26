package com.medplum.server.fhir.r4.repo.jdbc;

import java.sql.SQLException;
import java.util.UUID;

import jakarta.json.JsonObject;

import com.medplum.fhir.r4.types.SearchParameter;
import com.medplum.server.fhir.r4.search.Filter;
import com.medplum.server.sql.SelectQuery;

interface LookupTable {

    void createTables() throws SQLException;

    void indexResource(UUID resourceId, JsonObject resource) throws SQLException;

    boolean isIndexed(SearchParameter searchParam);

    void addSearchConditions(SelectQuery selectQuery, Filter filter);
}
