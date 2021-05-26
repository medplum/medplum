package com.medplum.server.fhir.r4.repo.jdbc;

import static com.medplum.util.IdUtils.*;

import java.io.Closeable;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import jakarta.inject.Inject;
import jakarta.json.JsonObject;
import jakarta.json.JsonPatch;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.r4.FhirSchema;
import com.medplum.fhir.r4.StandardOutcomes;
import com.medplum.fhir.r4.types.Bundle;
import com.medplum.fhir.r4.types.Bundle.BundleEntry;
import com.medplum.fhir.r4.types.FhirResource;
import com.medplum.fhir.r4.types.Meta;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.fhir.r4.types.Reference;
import com.medplum.fhir.r4.types.SearchParameter;
import com.medplum.server.fhir.r4.repo.BatchExecutor;
import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.fhir.r4.search.SearchParameters;
import com.medplum.server.fhir.r4.search.SearchRequest;
import com.medplum.server.fhir.r4.search.SearchUtils;
import com.medplum.server.security.SecurityUser;
import com.medplum.server.sql.ColumnType;
import com.medplum.server.sql.CreateTableQuery;
import com.medplum.server.sql.InsertQuery;
import com.medplum.server.sql.Operator;
import com.medplum.server.sql.SelectQuery;
import com.medplum.server.sql.UpdateQuery;
import com.medplum.server.sse.SseService;
import com.medplum.util.JsonUtils;

public class JdbcRepository implements Repository, Closeable {
    private static final Logger LOG = LoggerFactory.getLogger(JdbcRepository.class);
    private static final String COLUMN_ID = "ID";
    private static final String COLUMN_VERSION_ID = "VERSIONID";
    private static final String COLUMN_LAST_UPDATED = "LASTUPDATED";
    private static final String COLUMN_CONTENT = "CONTENT";
    private static final String COLUMN_PROJECT_COMPARTMENT_ID = "PROJECTCOMPARTMENTID";
    private static final String COLUMN_PATIENT_COMPARTMENT_ID = "PATIENTCOMPARTMENTID";
    private final Connection conn;
    private final SseService sseService;
    private final List<LookupTable> lookupTables;

    @Inject
    public JdbcRepository(final Connection conn, final SseService sseService) {
        this.conn = Objects.requireNonNull(conn);
        this.sseService = Objects.requireNonNull(sseService);
        this.lookupTables = Collections.unmodifiableList(Arrays.asList(
                new IdentifierTable(conn),
                new HumanNameTable(conn)
            ));
    }

    public void createTables() {
        try {
            for (final var lookupTable : lookupTables) {
                lookupTable.createTables();
            }

            for (final var resourceType : FhirSchema.getResourceTypes()) {
                createResourceTable(resourceType);
                createHistoryTable(resourceType);
            }
        } catch (final SQLException ex) {
            LOG.error("Error creating tables: {}", ex.getMessage(), ex);
        }
    }

    private void createResourceTable(final String resourceType) throws SQLException {
        final var builder = new CreateTableQuery(getTableName(resourceType))
                .column(COLUMN_ID, ColumnType.uuid().notNull().primaryKey())
                .column(COLUMN_PROJECT_COMPARTMENT_ID, ColumnType.uuid())
                .column(COLUMN_PATIENT_COMPARTMENT_ID, ColumnType.uuid())
                .column(COLUMN_LAST_UPDATED, ColumnType.timestamp().notNull())
                .column(COLUMN_CONTENT, ColumnType.text().notNull());

        for (final SearchParameter searchParam : SearchParameters.getParameters(resourceType)) {
            if (isIndexTable(searchParam)) {
                continue;
            }
            builder.column(getColumnName(searchParam.code()), ColumnType.varchar(128));
        }

        builder.execute(conn);
    }

    private boolean isIndexTable(final SearchParameter searchParam) {
        return getLookupTable(searchParam) != null;
    }

    private LookupTable getLookupTable(final SearchParameter searchParam) {
        for (final var lookupTable : lookupTables) {
            if (lookupTable.isIndexed(searchParam)) {
                return lookupTable;
            }
        }
        return null;
    }

    private void createHistoryTable(final String resourceType) throws SQLException {
        new CreateTableQuery(getHistoryTableName(resourceType))
                .column(COLUMN_VERSION_ID, ColumnType.uuid().notNull().primaryKey())
                .column(COLUMN_ID, ColumnType.uuid().notNull())
                .column(COLUMN_PROJECT_COMPARTMENT_ID, ColumnType.uuid())
                .column(COLUMN_PATIENT_COMPARTMENT_ID, ColumnType.uuid())
                .column(COLUMN_LAST_UPDATED, ColumnType.timestamp().notNull())
                .column(COLUMN_CONTENT, ColumnType.text().notNull())
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
                for (final var lookupTable : lookupTables) {
                    lookupTable.indexResource(uuid, resource);
                }

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

            for (final var filter : searchRequest.getFilters()) {
                final var searchParam = filter.getSearchParam();
                final var lookupTable = getLookupTable(searchParam);

                if (lookupTable != null) {
                    lookupTable.addSearchConditions(selectQuery, filter);
                } else if (filter.getSearchParam().type().equals("string")) {
                    selectQuery.condition(getColumnName(searchParam.code()), Operator.LIKE, filter.getValue(), Types.VARCHAR);
                } else {
                    selectQuery.condition(getColumnName(searchParam.code()), Operator.EQUALS, filter.getValue(), Types.VARCHAR);
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

    private static BundleEntry mapRowToBundleEntry(final ResultSet rs) throws SQLException {
        return BundleEntry.create().resource(JsonUtils.readJsonString(rs.getString(1))).build();
    }
}
