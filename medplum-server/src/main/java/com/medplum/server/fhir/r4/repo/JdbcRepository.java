package com.medplum.server.fhir.r4.repo;

import static com.medplum.util.IdUtils.*;

import java.io.Closeable;
import java.net.URI;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import jakarta.inject.Inject;
import jakarta.json.JsonArray;
import jakarta.json.JsonObject;
import jakarta.json.JsonPatch;
import jakarta.json.JsonValue;
import jakarta.json.JsonValue.ValueType;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.r4.FhirPropertyNames;
import com.medplum.fhir.r4.FhirSchema;
import com.medplum.fhir.r4.StandardOutcomes;
import com.medplum.fhir.r4.types.Bundle;
import com.medplum.fhir.r4.types.Bundle.BundleEntry;
import com.medplum.fhir.r4.types.FhirList;
import com.medplum.fhir.r4.types.FhirResource;
import com.medplum.fhir.r4.types.Identifier;
import com.medplum.fhir.r4.types.Meta;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.fhir.r4.types.Reference;
import com.medplum.fhir.r4.types.SearchParameter;
import com.medplum.server.fhir.r4.search.Filter;
import com.medplum.server.fhir.r4.search.SearchParameters;
import com.medplum.server.fhir.r4.search.SearchRequest;
import com.medplum.server.fhir.r4.search.SearchUtils;
import com.medplum.server.fhir.r4.search.SortRule;
import com.medplum.server.security.SecurityUser;
import com.medplum.server.sql.CreateTableQuery;
import com.medplum.server.sql.DeleteQuery;
import com.medplum.server.sql.InsertQuery;
import com.medplum.server.sql.Operator;
import com.medplum.server.sql.SqlBuilder;
import com.medplum.server.sql.UpdateQuery;
import com.medplum.server.sse.SseService;
import com.medplum.util.IdentifierComparator;
import com.medplum.util.JsonUtils;

public class JdbcRepository implements Repository, Closeable {
    private static final Logger LOG = LoggerFactory.getLogger(JdbcRepository.class);
    private static final String TABLE_IDENTIFIER = "IDENTIFIER";
    private static final String COLUMN_ID = "ID";
    private static final String COLUMN_VERSION_ID = "VERSIONID";
    private static final String COLUMN_LAST_UPDATED = "LASTUPDATED";
    private static final String COLUMN_CONTENT = "CONTENT";
    private static final String COLUMN_TYPE_UUID = "UUID";
    private static final String COLUMN_TYPE_TIMESTAMP = "TIMESTAMP";
    private static final String COLUMN_TYPE_TEXT = "TEXT";
    private static final String COLUMN_TYPE_VARCHAR128 = "VARCHAR(128)";
    private static final String COLUMN_IDENTIFIER_RESOURCE_ID = "RESOURCEID";
    private static final String COLUMN_IDENTIFIER_SYSTEM = "SYSTEM";
    private static final String COLUMN_IDENTIFIER_VALUE = "VALUE";
    private static final String COLUMN_PROJECT_COMPARTMENT_ID = "PROJECTCOMPARTMENTID";
    private static final String COLUMN_PATIENT_COMPARTMENT_ID = "PATIENTCOMPARTMENTID";
    private static final String PRIMARY_KEY = " PRIMARY KEY";
    private static final String NOT_NULL = " NOT NULL";
    private final Connection conn;
    private final SseService sseService;

    @Inject
    public JdbcRepository(final Connection conn, final SseService sseService) {
        this.conn = Objects.requireNonNull(conn);
        this.sseService = Objects.requireNonNull(sseService);
    }

    public void createTables() {
        try {
            createIdentifierTable();

            for (final String resourceType : FhirSchema.getResourceTypes()) {
                createResourceTable(resourceType);
                createHistoryTable(resourceType);
            }
        } catch (final SQLException ex) {
            LOG.error("Error creating tables: {}", ex.getMessage(), ex);
        }
    }

    private void createIdentifierTable() throws SQLException {
        new CreateTableQuery.Builder(TABLE_IDENTIFIER)
                .column(COLUMN_ID, COLUMN_TYPE_UUID + NOT_NULL + PRIMARY_KEY)
                .column(COLUMN_IDENTIFIER_RESOURCE_ID, COLUMN_TYPE_UUID + NOT_NULL)
                .column(COLUMN_IDENTIFIER_SYSTEM, COLUMN_TYPE_VARCHAR128)
                .column(COLUMN_IDENTIFIER_VALUE, COLUMN_TYPE_VARCHAR128)
                .index(COLUMN_IDENTIFIER_RESOURCE_ID)
                .index(COLUMN_IDENTIFIER_SYSTEM)
                .index(COLUMN_IDENTIFIER_VALUE)
                .build()
                .execute(conn);
    }

    private void createResourceTable(final String resourceType) throws SQLException {
        final CreateTableQuery.Builder builder = new CreateTableQuery.Builder(getTableName(resourceType))
                .column(COLUMN_ID, COLUMN_TYPE_UUID + NOT_NULL + PRIMARY_KEY)
                .column(COLUMN_PROJECT_COMPARTMENT_ID, COLUMN_TYPE_UUID)
                .column(COLUMN_PATIENT_COMPARTMENT_ID, COLUMN_TYPE_UUID)
                .column(COLUMN_LAST_UPDATED, COLUMN_TYPE_TIMESTAMP + NOT_NULL)
                .column(COLUMN_CONTENT, COLUMN_TYPE_TEXT + NOT_NULL);

        for (final SearchParameter searchParam : SearchParameters.getParameters(resourceType)) {
            if (isIndexTable(searchParam)) {
                continue;
            }
            builder.column(getColumnName(searchParam.code()), COLUMN_TYPE_VARCHAR128);
        }

        builder.build().execute(conn);
    }

    private boolean isIndexTable(final SearchParameter searchParam) {
        // Identifier searches handled with the Identifier table
        return searchParam.code().equals("identifier") && searchParam.type().equals("token");
    }

    private void createHistoryTable(final String resourceType) throws SQLException {
        new CreateTableQuery.Builder(getHistoryTableName(resourceType))
                .column(COLUMN_VERSION_ID, COLUMN_TYPE_UUID + NOT_NULL + PRIMARY_KEY)
                .column(COLUMN_ID, COLUMN_TYPE_UUID + NOT_NULL)
                .column(COLUMN_PROJECT_COMPARTMENT_ID, COLUMN_TYPE_UUID)
                .column(COLUMN_PATIENT_COMPARTMENT_ID, COLUMN_TYPE_UUID)
                .column(COLUMN_LAST_UPDATED, COLUMN_TYPE_TIMESTAMP + NOT_NULL)
                .column(COLUMN_CONTENT, COLUMN_TYPE_TEXT + NOT_NULL)
                .build()
                .execute(conn);
    }

    @Override
    public OperationOutcome validateCreate(final SecurityUser user, final FhirResource resource) {
        final OperationOutcome validateOutcome = FhirSchema.validate(resource);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        return StandardOutcomes.ok();
    }

    @Override
    public OperationOutcome validateUpdate(final SecurityUser user, final String id, final FhirResource resource) {
        final OperationOutcome validateOutcome = FhirSchema.validate(resource);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        return StandardOutcomes.ok();
    }

    @Override
    public OperationOutcome validateDelete(final SecurityUser user, final String resourceType, final String id) {
        return StandardOutcomes.ok();
    }

    @Override
    public OperationOutcome create(final SecurityUser user, final FhirResource data) {
        final OperationOutcome validateOutcome = FhirSchema.validate(data);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        return update(user, generateId(), data);
    }

    @Override
    public OperationOutcome read(final SecurityUser user, final String resourceType, final String id) {
        final OperationOutcome validateOutcome = FhirSchema.validate(resourceType);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        final UUID uuid = tryParseId(id);
        if (uuid == null) {
            return StandardOutcomes.notFound();
        }

        try (final Statement formatter = conn.createStatement()) {
            final StringBuilder sql = new StringBuilder();
            sql.append("SELECT ");
            sql.append(formatter.enquoteIdentifier(COLUMN_CONTENT, true));
            sql.append(" FROM ");
            sql.append(formatter.enquoteIdentifier(getTableName(resourceType), true));
            sql.append(" WHERE ");
            sql.append(formatter.enquoteIdentifier(COLUMN_ID, true));
            sql.append("=?");

            LOG.debug("{}", sql);

            try (final PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
                stmt.setObject(1, uuid, Types.BINARY);

                try (final ResultSet rs = stmt.executeQuery()) {
                    if (rs.next()) {
                        final String content = rs.getString(1);
                        final JsonObject data = JsonUtils.readJsonString(content);
                        return StandardOutcomes.ok(data);
                    } else {
                        return StandardOutcomes.notFound();
                    }
                }
            }

        } catch (final SQLException ex) {
            LOG.error("Error reading resource: {}", ex.getMessage(), ex);
            return StandardOutcomes.invalid(ex.getMessage());
        }
    }

    @Override
    public OperationOutcome readReference(final SecurityUser user, final Reference reference) {
        final String[] parts = reference.reference().split("/");
        final String resourceType = parts[0];
        final String id = parts[1];
        return read(user, resourceType, id);
    }

    @Override
    public OperationOutcome readHistory(final SecurityUser user, final String resourceType, final String id) {
        final OperationOutcome validateOutcome = FhirSchema.validate(resourceType);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        final UUID uuid = tryParseId(id);
        if (uuid == null) {
            return StandardOutcomes.notFound();
        }

        try (final Statement formatter = conn.createStatement()) {
            final StringBuilder sql = new StringBuilder();
            sql.append("SELECT ");
            sql.append(formatter.enquoteIdentifier(COLUMN_CONTENT, true));
            sql.append(" FROM ");
            sql.append(formatter.enquoteIdentifier(getHistoryTableName(resourceType), true));
            sql.append(" WHERE ");
            sql.append(formatter.enquoteIdentifier(COLUMN_ID, true));
            sql.append("=?");

            LOG.debug("{}", sql);

            final List<BundleEntry> results = new ArrayList<>();

            try (final PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
                stmt.setObject(1, uuid, Types.BINARY);

                try (final ResultSet rs = stmt.executeQuery()) {
                    while (rs.next()) {
                        final String content = rs.getString(1);
                        final JsonObject data = JsonUtils.readJsonString(content);
                        results.add(BundleEntry.create().resource(data).build());
                    }
                }
            }

            return StandardOutcomes.ok(Bundle.create().type("history").entry(results).build());

        } catch (final SQLException ex) {
            LOG.error("Error reading history: {}", ex.getMessage(), ex);
            return StandardOutcomes.invalid(ex.getMessage());
        }
    }

    @Override
    public OperationOutcome readVersion(final SecurityUser user, final String resourceType, final String id, final String vid) {
        final OperationOutcome validateOutcome = FhirSchema.validate(resourceType);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        final UUID uuid = tryParseId(id);
        if (uuid == null) {
            return StandardOutcomes.notFound();
        }

        final UUID versionUuid = tryParseId(vid);
        if (versionUuid == null) {
            return StandardOutcomes.notFound();
        }

        try (final Statement formatter = conn.createStatement()) {
            final StringBuilder sql = new StringBuilder();
            sql.append("SELECT ");
            sql.append(formatter.enquoteIdentifier(COLUMN_CONTENT, true));
            sql.append(" FROM ");
            sql.append(formatter.enquoteIdentifier(getHistoryTableName(resourceType), true));
            sql.append(" WHERE ");
            sql.append(formatter.enquoteIdentifier(COLUMN_ID, true));
            sql.append("=?");
            sql.append(" AND ");
            sql.append(formatter.enquoteIdentifier(COLUMN_VERSION_ID, true));
            sql.append("=?");

            LOG.debug("{}", sql);

            try (final PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
                stmt.setObject(1, uuid, Types.BINARY);
                stmt.setObject(2, versionUuid, Types.BINARY);

                try (final ResultSet rs = stmt.executeQuery()) {
                    if (rs.next()) {
                        final String content = rs.getString(1);
                        final JsonObject data = JsonUtils.readJsonString(content);
                        return StandardOutcomes.ok(data);
                    } else {
                        return StandardOutcomes.notFound();
                    }
                }
            }

        } catch (final SQLException ex) {
            LOG.error("Error reading resource: {}", ex.getMessage(), ex);
            return StandardOutcomes.invalid(ex.getMessage());
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public OperationOutcome update(final SecurityUser user, final String id, final FhirResource data) {
        final OperationOutcome validateOutcome = FhirSchema.validate(data);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        final UUID uuid = tryParseId(id);
        if (uuid == null) {
            return StandardOutcomes.invalid("Invalid ID (not a UUID)");
        }

        final String resourceType = data.resourceType();
        final OperationOutcome existingOutcome = read(user, resourceType, id);
        final FhirResource existing = existingOutcome.resource();
        final UUID versionId = UUID.randomUUID();
        final Instant lastUpdated = Instant.now();

        final Meta.Builder metaBuilder = Meta.create();
        if (existing != null) {
            metaBuilder.copyAll(existing.meta());
        }

        final Meta newMeta = data.meta();
        if (newMeta != null) {
            metaBuilder.copyAll(newMeta);
        }

        metaBuilder.versionId(versionId.toString());
        metaBuilder.lastUpdated(lastUpdated);

        @SuppressWarnings("rawtypes")
        final FhirResource.Builder builder = FhirResource.create(resourceType);
        if (existing != null) {
            builder.copyAll(existing);
        }

        builder.copyAll(data);
        builder.id(id);
        builder.meta(metaBuilder.build());

        final FhirResource resource = builder.build();
        final OperationOutcome result;
        if (existing == null) {
            result = createImpl(resourceType, uuid, versionId, lastUpdated, resource);
        } else {
            result = updateImpl(resourceType, uuid, versionId, lastUpdated, resource);
        }

        if (result.isOk()) {
            try {
                writeIdentifiers(uuid, resource);
            } catch (final SQLException ex) {
                LOG.error("Error writing resource identifiers: {}", ex.getMessage(), ex);
                return StandardOutcomes.invalid(ex.getMessage());
            }

            try {
                writeVersion(resourceType, uuid, versionId, lastUpdated, resource);
            } catch (final SQLException ex) {
                LOG.error("Error writing version history: {}", ex.getMessage(), ex);
                return StandardOutcomes.invalid(ex.getMessage());
            }

            sseService.handleUp(resource);
        }

        return result;
    }

    private OperationOutcome createImpl(
            final String resourceType,
            final UUID id,
            final UUID versionId,
            final Instant lastUpdated,
            final FhirResource resource) {

        try {
            final InsertQuery insertQuery = new InsertQuery(getTableName(resourceType))
                    .value(COLUMN_ID, id, Types.BINARY)
                    .value(COLUMN_LAST_UPDATED, Timestamp.from(lastUpdated), Types.TIMESTAMP)
                    .value(COLUMN_CONTENT, resource.toString(), Types.LONGVARCHAR);

            for (final SearchParameter param : SearchParameters.getParameters(resourceType)) {
                if (isIndexTable(param)) {
                    continue;
                }
                insertQuery.value(getColumnName(param.code()), getColumnValue(param.expression(), resource), Types.VARCHAR);
            }

            insertQuery.execute(conn);
            return StandardOutcomes.created(resource);

        } catch (final SQLException ex) {
            LOG.error("Error creating resource: {}", ex.getMessage(), ex);
            return StandardOutcomes.invalid(ex.getMessage());
        }
    }

    private OperationOutcome updateImpl(
            final String resourceType,
            final UUID id,
            final UUID versionId,
            final Instant lastUpdated,
            final FhirResource resource) {

        try {
            final var updateQuery = new UpdateQuery(getTableName(resourceType))
                    .value(COLUMN_LAST_UPDATED, Timestamp.from(lastUpdated), Types.TIMESTAMP)
                    .value(COLUMN_CONTENT, resource.toString(), Types.LONGVARCHAR);

            for (final SearchParameter param : SearchParameters.getParameters(resourceType)) {
                if (isIndexTable(param)) {
                    continue;
                }
                updateQuery.value(getColumnName(param.code()), getColumnValue(param.expression(), resource), Types.VARCHAR);
            }

            updateQuery.condition(COLUMN_ID, Operator.EQUALS, id, Types.BINARY);
            updateQuery.execute(conn);
            return StandardOutcomes.ok(resource);

        } catch (final SQLException ex) {
            LOG.error("Error creating resource: {}", ex.getMessage(), ex);
            return StandardOutcomes.invalid(ex.getMessage());
        }
    }

    private void writeIdentifiers(final UUID resourceId, final JsonObject resource) throws SQLException {
        if (!resource.containsKey(FhirPropertyNames.PROPERTY_IDENTIFIER)) {
            return;
        }

        final JsonValue identifier = resource.get(FhirPropertyNames.PROPERTY_IDENTIFIER);
        if (identifier == null || identifier.getValueType() != ValueType.ARRAY) {
            return;
        }

        final List<Identifier> incoming = new ArrayList<>(new FhirList<>(Identifier.class, (JsonArray) identifier));
        final List<Identifier> existing = this.getIdentifiers(resourceId);

        if (!compareIdentifiers(incoming, existing)) {
            new DeleteQuery(TABLE_IDENTIFIER)
                    .condition(COLUMN_IDENTIFIER_RESOURCE_ID, Operator.EQUALS, resourceId, Types.BINARY)
                    .execute(conn);

            for (final Identifier incomingId : incoming) {
                new InsertQuery(TABLE_IDENTIFIER)
                        .value(COLUMN_ID, UUID.randomUUID(), Types.BINARY)
                        .value(COLUMN_IDENTIFIER_RESOURCE_ID, resourceId, Types.BINARY)
                        .value(COLUMN_IDENTIFIER_SYSTEM, incomingId.system().toString(), Types.VARCHAR)
                        .value(COLUMN_IDENTIFIER_VALUE, incomingId.value(), Types.VARCHAR)
                        .execute(conn);
            }
        }
    }

    private boolean compareIdentifiers(final List<Identifier> incoming, final List<Identifier> existing) {
        if (incoming.size() != existing.size()) {
            return false;
        }

        incoming.sort(IdentifierComparator.INSTANCE);
        existing.sort(IdentifierComparator.INSTANCE);

        for (int i = 0; i < incoming.size(); i++) {
            final Identifier incomingId = incoming.get(i);
            final Identifier existingId = existing.get(i);
            if (!incomingId.system().equals(existingId.system()) || !incomingId.value().equals(existingId.value())) {
                return false;
            }
        }

        return true;
    }

    private void writeVersion(
            final String resourceType,
            final UUID id,
            final UUID versionId,
            final Instant lastUpdated,
            final JsonObject resource)
                    throws SQLException {

        new InsertQuery(getHistoryTableName(resourceType))
                .value(COLUMN_VERSION_ID, versionId, Types.BINARY)
                .value(COLUMN_ID, id, Types.BINARY)
                .value(COLUMN_LAST_UPDATED, Timestamp.from(lastUpdated), Types.TIMESTAMP)
                .value(COLUMN_CONTENT, resource.toString(), Types.VARCHAR)
                .execute(conn);
    }

    @Override
    public OperationOutcome delete(final SecurityUser user, final String resourceType, final String id) {
        throw new UnsupportedOperationException();
    }

    @Override
    public OperationOutcome search(final SecurityUser user, final SearchRequest searchRequest) {
        LOG.debug("{}", searchRequest);

        final OperationOutcome validateOutcome = FhirSchema.validate(searchRequest.getResourceType());
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        if (!user.getSmartScopes().canRead(searchRequest.getResourceType())) {
            return StandardOutcomes.security("Cannot read resource type");
        }

        final String tableName = getTableName(searchRequest.getResourceType());

        try (final SqlBuilder sql = new SqlBuilder(conn)) {
            sql.append("SELECT ");
            sql.appendIdentifier(COLUMN_CONTENT);
            sql.append(" FROM ");
            sql.appendIdentifier(tableName);

            boolean joinIdentifier = false;
            for (final Filter filter : searchRequest.getFilters()) {
                final SearchParameter searchParam = filter.getSearchParam();
                if (searchParam.code().equals("identifier") && searchParam.type().equals("token")) {
                    joinIdentifier = true;
                }
            }

            if (joinIdentifier) {
                sql.append(" JOIN ");
                sql.appendIdentifier(TABLE_IDENTIFIER);
                sql.append(" ON ");
                sql.appendIdentifier(tableName);
                sql.append(".");
                sql.appendIdentifier(COLUMN_ID);
                sql.append("=");
                sql.appendIdentifier(TABLE_IDENTIFIER);
                sql.append(".");
                sql.appendIdentifier(COLUMN_IDENTIFIER_RESOURCE_ID);
            }

            boolean first = true;
            for (final Filter filter : searchRequest.getFilters()) {
                final SearchParameter searchParam = filter.getSearchParam();

                sql.append(first ? " WHERE " : " AND ");

                if (isIndexTable(filter.getSearchParam())) {
                    if (searchParam.code().equals("identifier") && searchParam.type().equals("token")) {
                        sql.appendIdentifier(TABLE_IDENTIFIER);
                        sql.append(".");
                        sql.appendIdentifier(COLUMN_IDENTIFIER_VALUE);
                        sql.append("=?");
                    }

                } else {
                    sql.appendIdentifier(getColumnName(searchParam.code()));
                    if (filter.getSearchParam().type().equals("string")) {
                        sql.append(" LIKE ?");
                    } else {
                        sql.append("=?");
                    }
                }
                first = false;
            }

            first = true;
            for (final SortRule sortRule : searchRequest.getSortRules()) {
                sql.append(first ? " ORDER BY " : ", ");
                sql.appendIdentifier(getColumnName(sortRule.getCode()));
                sql.append(sortRule.isDescending() ? " DESC" : " ASC");
                first = false;
            }

            sql.append(" LIMIT ");
            sql.append(searchRequest.getCount());
            sql.append(" OFFSET ");
            sql.append(searchRequest.getCount() * searchRequest.getPage());

            LOG.debug("{}", sql);

            final List<BundleEntry> results = new ArrayList<>();

            try (final PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
                int i = 1;
                for (final Filter filter : searchRequest.getFilters()) {
                    if (filter.getSearchParam().code().equals("_id")) {
                        stmt.setObject(i, tryParseId(filter.getValue()), Types.BINARY);
                    } else if (filter.getSearchParam().type().equals("string")) {
                        stmt.setString(i, "%" + filter.getValue() + "%");
                    } else {
                        stmt.setString(i, filter.getValue());
                    }
                    i++;
                }

                try (final ResultSet rs = stmt.executeQuery()) {
                    while (rs.next()) {
                        final String content = rs.getString(1);
                        final JsonObject data = JsonUtils.readJsonString(content);
                        results.add(BundleEntry.create().resource(data).build());
                    }
                }
            }

            return StandardOutcomes.ok(Bundle.create().type("searchset").entry(results).build());

        } catch (final SQLException ex) {
            LOG.error("Error searching: {}", ex.getMessage(), ex);
            return StandardOutcomes.invalid(ex.getMessage());
        }
    }

    @Override
    public OperationOutcome createBatch(final SecurityUser user, final Bundle data) {
        return new BatchExecutor(this).createBatch(user, data);
    }

    @Override
    public OperationOutcome processMessage(final SecurityUser user, final Bundle bundle) {
        throw new UnsupportedOperationException();
    }

    @Override
    public OperationOutcome patch(final SecurityUser user, final String resourceType, final String id, final JsonPatch patch) {
        throw new UnsupportedOperationException();
    }

    @Override
    public OperationOutcome searchPatientEverything(final SecurityUser user, final String patientId) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void close() {
        try {
            conn.close();
        } catch (final SQLException ex) {
            LOG.error("Error closing: {}", ex.getMessage(), ex);
        }
    }

    private static String getTableName(final String resourceType) {
        return resourceType.toUpperCase();
    }

    private static String getHistoryTableName(final String resourceType) {
        return resourceType.toUpperCase() + "_HISTORY";
    }

    private static String getColumnName(final String searchParam) {
        if (searchParam.equals("_id")) {
            return COLUMN_ID;
        }
        if (searchParam.equals("meta.lastUpdated")) {
            return COLUMN_LAST_UPDATED;
        }
        return searchParam.replaceAll("-", "").toUpperCase();
    }

    private static String getColumnValue(final String expression, final JsonObject obj) {
        final String result = SearchUtils.evalAsString(expression, obj);
        if (result == null) {
            return null;
        }
        if (result.length() > 127) {
            return result.substring(0, 127);
        }
        return result;
    }

    private List<Identifier> getIdentifiers(final UUID resourceId) throws SQLException {
        try (final SqlBuilder sql = new SqlBuilder(conn)) {
            sql.append("SELECT ");
            sql.appendIdentifier(COLUMN_IDENTIFIER_SYSTEM);
            sql.append(", ");
            sql.appendIdentifier(COLUMN_IDENTIFIER_VALUE);
            sql.append(" FROM ");
            sql.appendIdentifier(TABLE_IDENTIFIER);
            sql.append(" WHERE ");
            sql.appendIdentifier(COLUMN_IDENTIFIER_RESOURCE_ID);
            sql.append("=?");

            LOG.debug("{}", sql);

            final List<Identifier> results = new ArrayList<>();

            try (final PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
                stmt.setObject(1, resourceId, Types.BINARY);

                try (final ResultSet rs = stmt.executeQuery()) {
                    while (rs.next()) {
                        results.add(Identifier.create()
                                .system(URI.create(rs.getString(1)))
                                .value(rs.getString(2))
                                .build());
                    }
                }
            }

            return results;
        }
    }
}
