package com.medplum.server.fhir.r4.repo;

import static com.medplum.util.IdUtils.*;

import java.io.Closeable;
import java.net.URI;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
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
import com.medplum.server.fhir.r4.search.SearchParameters;
import com.medplum.server.fhir.r4.search.SearchRequest;
import com.medplum.server.fhir.r4.search.SearchUtils;
import com.medplum.server.security.SecurityUser;
import com.medplum.server.sql.Column;
import com.medplum.server.sql.CreateTableQuery;
import com.medplum.server.sql.DeleteQuery;
import com.medplum.server.sql.InsertQuery;
import com.medplum.server.sql.Operator;
import com.medplum.server.sql.SelectQuery;
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
    private static final String SEARCH_PARAM_CODE_IDENTIFIER = "identifier";
    private static final String SEARCH_PARAM_TYPE_TOKEN = "token";
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

            for (final var resourceType : FhirSchema.getResourceTypes()) {
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
        final var builder = new CreateTableQuery.Builder(getTableName(resourceType))
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

    private static boolean isIndexTable(final SearchParameter searchParam) {
        // Identifier searches handled with the Identifier table
        return isIdentifierToken(searchParam);
    }

    private static boolean isIdentifierToken(final SearchParameter searchParam) {
        return searchParam.code().equals(SEARCH_PARAM_CODE_IDENTIFIER) &&
                searchParam.type().equals(SEARCH_PARAM_TYPE_TOKEN);
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
        final var validateOutcome = FhirSchema.validate(resource);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        return StandardOutcomes.ok();
    }

    @Override
    public OperationOutcome validateUpdate(final SecurityUser user, final String id, final FhirResource resource) {
        final var validateOutcome = FhirSchema.validate(resource);
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
        final var validateOutcome = FhirSchema.validate(data);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        return update(user, generateId(), data);
    }

    @Override
    public OperationOutcome read(final SecurityUser user, final String resourceType, final String id) {
        final var validateOutcome = FhirSchema.validate(resourceType);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        final var uuid = tryParseId(id);
        if (uuid == null) {
            return StandardOutcomes.notFound();
        }

        try {
            final var results = new SelectQuery(getTableName(resourceType))
                    .column(COLUMN_CONTENT)
                    .condition(COLUMN_ID, Operator.EQUALS, uuid, Types.BINARY)
                    .execute(conn, rs -> JsonUtils.readJsonString(rs.getString(1)));

            if (results.isEmpty()) {
                return StandardOutcomes.notFound();
            } else {
                return StandardOutcomes.ok(results.get(0));
            }

        } catch (final SQLException ex) {
            LOG.error("Error reading resource: {}", ex.getMessage(), ex);
            return StandardOutcomes.invalid(ex.getMessage());
        }
    }

    @Override
    public OperationOutcome readReference(final SecurityUser user, final Reference reference) {
        final var parts = reference.reference().split("/");
        final var resourceType = parts[0];
        final var id = parts[1];
        return read(user, resourceType, id);
    }

    @Override
    public OperationOutcome readHistory(final SecurityUser user, final String resourceType, final String id) {
        final var validateOutcome = FhirSchema.validate(resourceType);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        final var uuid = tryParseId(id);
        if (uuid == null) {
            return StandardOutcomes.notFound();
        }

        try {
            final var results = new SelectQuery(getHistoryTableName(resourceType))
                    .column(COLUMN_CONTENT)
                    .condition(COLUMN_ID, Operator.EQUALS, uuid, Types.BINARY)
                    .execute(conn, JdbcRepository::mapRowToBundleEntry);

            return StandardOutcomes.ok(Bundle.create()
                    .type("history")
                    .entry(results)
                    .build());

        } catch (final SQLException ex) {
            LOG.error("Error reading history: {}", ex.getMessage(), ex);
            return StandardOutcomes.invalid(ex.getMessage());
        }
    }

    @Override
    public OperationOutcome readVersion(final SecurityUser user, final String resourceType, final String id, final String vid) {
        final var validateOutcome = FhirSchema.validate(resourceType);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        final var uuid = tryParseId(id);
        if (uuid == null) {
            return StandardOutcomes.notFound();
        }

        final var versionUuid = tryParseId(vid);
        if (versionUuid == null) {
            return StandardOutcomes.notFound();
        }

        try {
            final var results = new SelectQuery(getHistoryTableName(resourceType))
                    .column(COLUMN_CONTENT)
                    .condition(COLUMN_ID, Operator.EQUALS, uuid, Types.BINARY)
                    .condition(COLUMN_VERSION_ID, Operator.EQUALS, versionUuid, Types.BINARY)
                    .execute(conn, rs -> JsonUtils.readJsonString(rs.getString(1)));

            if (results.isEmpty()) {
                return StandardOutcomes.notFound();
            } else {
                return StandardOutcomes.ok(results.get(0));
            }

        } catch (final SQLException ex) {
            LOG.error("Error reading resource: {}", ex.getMessage(), ex);
            return StandardOutcomes.invalid(ex.getMessage());
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public OperationOutcome update(final SecurityUser user, final String id, final FhirResource data) {
        final var validateOutcome = FhirSchema.validate(data);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        final var uuid = tryParseId(id);
        if (uuid == null) {
            return StandardOutcomes.invalid("Invalid ID (not a UUID)");
        }

        final var resourceType = data.resourceType();
        final var existingOutcome = read(user, resourceType, id);
        final var existing = existingOutcome.resource();
        final var versionId = UUID.randomUUID();
        final var lastUpdated = Instant.now();

        final var metaBuilder = Meta.create();
        if (existing != null) {
            metaBuilder.copyAll(existing.meta());
        }

        final var newMeta = data.meta();
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

        final var resource = builder.build();
        final OperationOutcome result;
        if (existing == null) {
            result = createImpl(resourceType, uuid, lastUpdated, resource);
        } else {
            result = updateImpl(resourceType, uuid, lastUpdated, resource);
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
            final Instant lastUpdated,
            final FhirResource resource) {

        try {
            final var insertQuery = new InsertQuery(getTableName(resourceType))
                    .value(COLUMN_ID, id, Types.BINARY)
                    .value(COLUMN_LAST_UPDATED, Timestamp.from(lastUpdated), Types.TIMESTAMP)
                    .value(COLUMN_CONTENT, resource.toString(), Types.LONGVARCHAR);

            for (final var param : SearchParameters.getParameters(resourceType)) {
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
            final Instant lastUpdated,
            final FhirResource resource) {

        try {
            final var updateQuery = new UpdateQuery(getTableName(resourceType))
                    .value(COLUMN_LAST_UPDATED, Timestamp.from(lastUpdated), Types.TIMESTAMP)
                    .value(COLUMN_CONTENT, resource.toString(), Types.LONGVARCHAR);

            for (final var param : SearchParameters.getParameters(resourceType)) {
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

        final var incoming = new ArrayList<>(new FhirList<>(Identifier.class, (JsonArray) identifier));
        final var existing = this.getIdentifiers(resourceId);

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

        for (var i = 0; i < incoming.size(); i++) {
            final var incomingId = incoming.get(i);
            final var existingId = existing.get(i);
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

        final var validateOutcome = FhirSchema.validate(searchRequest.getResourceType());
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        if (!user.getSmartScopes().canRead(searchRequest.getResourceType())) {
            return StandardOutcomes.security("Cannot read resource type");
        }

        try {
            final var selectQuery = new SelectQuery(getTableName(searchRequest.getResourceType())).column(COLUMN_CONTENT);

            var joinIdentifier = false;
            for (final var filter : searchRequest.getFilters()) {
                final var searchParam = filter.getSearchParam();
                if (isIdentifierToken(searchParam)) {
                    joinIdentifier = true;
                }
            }

            if (joinIdentifier) {
                selectQuery.join(TABLE_IDENTIFIER, COLUMN_ID, COLUMN_IDENTIFIER_RESOURCE_ID);
            }

            for (final var filter : searchRequest.getFilters()) {
                final var searchParam = filter.getSearchParam();

                if (isIndexTable(searchParam)) {
                    if (isIdentifierToken(searchParam)) {
                        selectQuery.condition(
                                new Column(TABLE_IDENTIFIER, COLUMN_IDENTIFIER_VALUE),
                                Operator.EQUALS,
                                filter.getValue(),
                                Types.VARCHAR);
                    }

                } else {
                    if (filter.getSearchParam().type().equals("string")) {
                        selectQuery.condition(getColumnName(searchParam.code()), Operator.LIKE, filter.getValue(), Types.VARCHAR);
                    } else {
                        selectQuery.condition(getColumnName(searchParam.code()), Operator.EQUALS, filter.getValue(), Types.VARCHAR);
                    }
                }
            }

            for (final var sortRule : searchRequest.getSortRules()) {
                selectQuery.orderBy(getColumnName(sortRule.getCode()), sortRule.isDescending());
            }

            selectQuery.limit(searchRequest.getCount());
            selectQuery.offset(searchRequest.getCount() * searchRequest.getPage());

            final var results = selectQuery.execute(conn, JdbcRepository::mapRowToBundleEntry);

            return StandardOutcomes.ok(Bundle.create()
                    .type("searchset")
                    .entry(results)
                    .build());

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
        return searchParam.replace("-", "").toUpperCase();
    }

    private static String getColumnValue(final String expression, final JsonObject obj) {
        final var result = SearchUtils.evalAsString(expression, obj);
        if (result == null) {
            return null;
        }
        if (result.length() > 127) {
            return result.substring(0, 127);
        }
        return result;
    }

    private List<Identifier> getIdentifiers(final UUID resourceId) throws SQLException {
        return new SelectQuery(TABLE_IDENTIFIER)
                .column(COLUMN_IDENTIFIER_SYSTEM)
                .column(COLUMN_IDENTIFIER_VALUE)
                .condition(COLUMN_IDENTIFIER_RESOURCE_ID, Operator.EQUALS, resourceId, Types.BINARY)
                .execute(conn, rs -> Identifier.create()
                        .system(URI.create(rs.getString(1)))
                        .value(rs.getString(2))
                        .build());
    }

    private static BundleEntry mapRowToBundleEntry(final ResultSet rs) throws SQLException {
        return BundleEntry.create().resource(JsonUtils.readJsonString(rs.getString(1))).build();
    }
}
