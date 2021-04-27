package com.medplum.server.fhir.repo;

import static com.medplum.fhir.IdUtils.*;

import java.io.Closeable;
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
import java.util.UUID;

import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.json.JsonPatch;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;
import jakarta.json.JsonValue.ValueType;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.FhirPath;
import com.medplum.fhir.FhirSchema;
import com.medplum.fhir.JsonUtils;
import com.medplum.fhir.StandardOperations;
import com.medplum.fhir.types.Bundle;
import com.medplum.fhir.types.Bundle.BundleEntry;
import com.medplum.fhir.types.FhirResource;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.fhir.types.Reference;
import com.medplum.fhir.types.SearchParameter;
import com.medplum.server.search.Filter;
import com.medplum.server.search.SearchParameters;
import com.medplum.server.search.SearchRequest;
import com.medplum.server.search.SortRule;
import com.medplum.server.security.SecurityUser;
import com.medplum.server.sql.CreateTableQuery;
import com.medplum.server.sql.CreateTableQuery.ColumnDefinition;
import com.medplum.server.sql.InsertQuery;
import com.medplum.server.sql.Parameter;
import com.medplum.server.sql.SqlBuilder;
import com.medplum.server.sql.UpdateQuery;

public class JdbcRepository implements Repository, Closeable {
    private static final Logger LOG = LoggerFactory.getLogger(JdbcRepository.class);
    private static final String COLUMN_ID = "ID";
    private static final String COLUMN_VERSION_ID = "VERSIONID";
    private static final String COLUMN_LAST_UPDATED = "LASTUPDATED";
    private static final String COLUMN_CONTENT = "CONTENT";
    private static final String COLUMN_TYPE_UUID = "UUID NOT NULL";
    private static final String COLUMN_TYPE_TIMESTAMP = "TIMESTAMP NOT NULL";
    private static final String COLUMN_TYPE_TEXT = "TEXT NOT NULL";
    private static final String COLUMN_TYPE_VARCHAR128 = "VARCHAR(128)";
    private static final String PRIMARY_KEY = " PRIMARY KEY";
    private final Connection conn;

    @Inject
    public JdbcRepository(final Connection conn) {
        this.conn = conn;
    }

    public void createTables() {
        try {
            for (final String resourceType : FhirSchema.getResourceTypes()) {
                createResourceTable(resourceType);
                createHistoryTable(resourceType);
            }
        } catch (final SQLException ex) {
            LOG.error("Error creating tables: {}", ex.getMessage(), ex);
        }
    }

    private void createResourceTable(final String resourceType) throws SQLException {
        final CreateTableQuery.Builder builder = new CreateTableQuery.Builder(getTableName(resourceType))
                .column(COLUMN_ID, COLUMN_TYPE_UUID + PRIMARY_KEY)
                .column(COLUMN_LAST_UPDATED, COLUMN_TYPE_TIMESTAMP)
                .column(COLUMN_CONTENT, COLUMN_TYPE_TEXT);

        for (final SearchParameter searchParam : SearchParameters.getParameters(resourceType)) {
            builder.column(getColumnName(searchParam.code()), COLUMN_TYPE_VARCHAR128);
        }

        executeCreateTable(builder.build());
    }

    private void createHistoryTable(final String resourceType) throws SQLException {
        executeCreateTable(new CreateTableQuery.Builder(getHistoryTableName(resourceType))
                .column(COLUMN_VERSION_ID, COLUMN_TYPE_UUID + PRIMARY_KEY)
                .column(COLUMN_ID, COLUMN_TYPE_UUID)
                .column(COLUMN_LAST_UPDATED, COLUMN_TYPE_TIMESTAMP)
                .column(COLUMN_CONTENT, COLUMN_TYPE_TEXT)
                .build());
    }

    @Override
    public OperationOutcome create(final SecurityUser user, final String resourceType, final JsonObject data) {
        final OperationOutcome validateOutcome = FhirSchema.validate(data);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        return update(user, resourceType, generateId(), data);
    }

    @Override
    public OperationOutcome read(final SecurityUser user, final String resourceType, final String id) {
        final OperationOutcome validateOutcome = FhirSchema.validate(resourceType);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        final UUID uuid = tryParseId(id);
        if (uuid == null) {
            return StandardOperations.notFound();
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
                        return StandardOperations.ok(data);
                    } else {
                        return StandardOperations.notFound();
                    }
                }
            }

        } catch (final SQLException ex) {
            LOG.error("Error reading resource: {}", ex.getMessage(), ex);
            return StandardOperations.invalid(ex.getMessage());
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
            return StandardOperations.notFound();
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

            return StandardOperations.ok(Bundle.create().type("history").entry(results).build());

        } catch (final SQLException ex) {
            LOG.error("Error reading history: {}", ex.getMessage(), ex);
            return StandardOperations.invalid(ex.getMessage());
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
            return StandardOperations.notFound();
        }

        final UUID versionUuid = tryParseId(vid);
        if (versionUuid == null) {
            return StandardOperations.notFound();
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
                        return StandardOperations.ok(data);
                    } else {
                        return StandardOperations.notFound();
                    }
                }
            }

        } catch (final SQLException ex) {
            LOG.error("Error reading resource: {}", ex.getMessage(), ex);
            return StandardOperations.invalid(ex.getMessage());
        }
    }

    @Override
    public OperationOutcome update(final SecurityUser user, final String resourceType, final String id, final JsonObject data) {
        final OperationOutcome validateOutcome = FhirSchema.validate(data);
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        final UUID uuid = tryParseId(id);
        if (uuid == null) {
            return StandardOperations.invalid("Invalid ID (not a UUID)");
        }

        final OperationOutcome existingOutcome = read(user, resourceType, id);
        final FhirResource existing = existingOutcome.resource();
        final UUID versionId = UUID.randomUUID();
        final Instant lastUpdated = Instant.now();

        final JsonObjectBuilder metaBuilder = Json.createObjectBuilder();
        if (existing != null) {
            final JsonObject existingMeta = existing.getJsonObject("meta");
            existingMeta.entrySet().forEach(e -> metaBuilder.add(e.getKey(), e.getValue()));
        }

        final JsonObject newMeta = data.getJsonObject("meta");
        if (newMeta != null) {
            newMeta.entrySet().forEach(e -> metaBuilder.add(e.getKey(), e.getValue()));
        }

        metaBuilder.add("versionId", versionId.toString());
        metaBuilder.add("lastUpdated", lastUpdated.toString());

        final JsonObjectBuilder builder = Json.createObjectBuilder();
        if (existing != null) {
            existing.entrySet().forEach(e -> builder.add(e.getKey(), e.getValue()));
        }

        data.entrySet().forEach(e -> builder.add(e.getKey(), e.getValue()));

        builder.add("resourceType", resourceType);
        builder.add("id", id);
        builder.add("meta", metaBuilder.build());

        final JsonObject resource = builder.build();
        return existing == null ?
                createImpl(resourceType, uuid, versionId, lastUpdated, resource) :
                updateImpl(resourceType, uuid, versionId, lastUpdated, resource);
    }

    private OperationOutcome createImpl(
            final String resourceType,
            final UUID id,
            final UUID versionId,
            final Instant lastUpdated,
            final JsonObject resource) {

        final InsertQuery.Builder builder = new InsertQuery.Builder(getTableName(resourceType))
                .value(COLUMN_ID, id, Types.BINARY)
                .value(COLUMN_LAST_UPDATED, Timestamp.from(lastUpdated), Types.TIMESTAMP)
                .value(COLUMN_CONTENT, resource.toString(), Types.LONGVARCHAR);

        for (final SearchParameter param : SearchParameters.getParameters(resourceType)) {
            builder.value(getColumnName(param.code()), evalAsString(param.expression(), resource), Types.VARCHAR);
        }

        try {
            executeInsert(builder.build());
            writeVersion(resourceType, id, versionId, lastUpdated, resource);
            return StandardOperations.created(resource);

        } catch (final SQLException ex) {
            LOG.error("Error creating resource: {}", ex.getMessage(), ex);
            return StandardOperations.invalid(ex.getMessage());
        }
    }

    private OperationOutcome updateImpl(
            final String resourceType,
            final UUID id,
            final UUID versionId,
            final Instant lastUpdated,
            final JsonObject resource) {

        final UpdateQuery.Builder builder = new UpdateQuery.Builder(getTableName(resourceType))
                .value(COLUMN_LAST_UPDATED, Timestamp.from(lastUpdated), Types.TIMESTAMP)
                .value(COLUMN_CONTENT, resource.toString(), Types.LONGVARCHAR);

        for (final SearchParameter param : SearchParameters.getParameters(resourceType)) {
            builder.value(getColumnName(param.code()), evalAsString(param.expression(), resource), Types.VARCHAR);
        }

        builder.condition(COLUMN_ID, id, Types.BINARY);

        try {
            executeUpdate(builder.build());
            writeVersion(resourceType, id, versionId, lastUpdated, resource);
            return StandardOperations.ok(resource);

        } catch (final SQLException ex) {
            LOG.error("Error creating resource: {}", ex.getMessage(), ex);
            return StandardOperations.invalid(ex.getMessage());
        }
    }

    private void writeVersion(
            final String resourceType,
            final UUID id,
            final UUID versionId,
            final Instant lastUpdated,
            final JsonObject resource)
                    throws SQLException {

        executeInsert(new InsertQuery.Builder(getHistoryTableName(resourceType))
                .value(COLUMN_VERSION_ID, versionId, Types.BINARY)
                .value(COLUMN_ID, id, Types.BINARY)
                .value(COLUMN_LAST_UPDATED, Timestamp.from(lastUpdated), Types.TIMESTAMP)
                .value(COLUMN_CONTENT, resource.toString(), Types.VARCHAR)
                .build());
    }

    @Override
    public OperationOutcome delete(final SecurityUser user, final String resourceType, final String id) {
        throw new UnsupportedOperationException();
    }

    @Override
    public OperationOutcome search(final SecurityUser user, final SearchRequest searchRequest) {
        final OperationOutcome validateOutcome = FhirSchema.validate(searchRequest.getResourceType());
        if (!validateOutcome.isOk()) {
            return validateOutcome;
        }

        if (!user.getSmartScopes().canRead(searchRequest.getResourceType())) {
            return StandardOperations.security("Cannot read resource type");
        }

        try (final Statement formatter = conn.createStatement()) {
            final StringBuilder sql = new StringBuilder();
            sql.append("SELECT ");
            sql.append(formatter.enquoteIdentifier(COLUMN_CONTENT, true));
            sql.append(" FROM ");
            sql.append(formatter.enquoteIdentifier(getTableName(searchRequest.getResourceType()), true));

            boolean first = true;
            for (final Filter filter : searchRequest.getFilters()) {
                sql.append(first ? " WHERE " : " AND ");
                sql.append(formatter.enquoteIdentifier(getColumnName(filter.getSearchParam().code()), true));
                if (filter.getSearchParam().type().equals("string")) {
                    sql.append(" LIKE ?");
                } else {
                    sql.append("=?");
                }
                first = false;
            }

            first = true;
            for (final SortRule sortRule : searchRequest.getSortRules()) {
                sql.append(first ? " ORDER BY " : ", ");
                sql.append(formatter.enquoteIdentifier(getColumnName(sortRule.getCode()), true));
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

            return StandardOperations.ok(Bundle.create().type("searchset").entry(results).build());

        } catch (final SQLException ex) {
            LOG.error("Error searching: {}", ex.getMessage(), ex);
            return StandardOperations.invalid(ex.getMessage());
        }
    }

    @Override
    public OperationOutcome createBatch(final SecurityUser user, final JsonObject data) {
        return new BatchExecutor(this).createBatch(user, data);
    }

    @Override
    public OperationOutcome processMessage(final SecurityUser user, final JsonObject bundle) {
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

    private static String evalAsString(final String expression, final JsonObject obj) {
        final JsonValue value = new FhirPath(expression).evalFirst(obj);
        if (value == null || value.getValueType() == ValueType.NULL) {
            return null;
        }

        final String result;
        switch (value.getValueType()) {
        case STRING:
            result = ((JsonString) value).getString();
            break;

        default:
            result = value.toString();
            break;
        }

        return result.length() > 127 ? result.substring(0, 127) : result;
    }

    private void executeCreateTable(final CreateTableQuery createTableQuery) throws SQLException {
        try (final SqlBuilder sql = new SqlBuilder(conn)) {
            sql.append("CREATE TABLE IF NOT EXISTS ");
            sql.appendIdentifier(createTableQuery.getTableName());
            sql.append(" (");

            boolean first = true;
            for (final ColumnDefinition column : createTableQuery.getColumns()) {
                if (!first) {
                    sql.append(",");
                }
                sql.appendIdentifier(column.getColumnName());
                sql.append(" ");
                sql.append(column.getColumnType());
                first = false;
            }

            sql.append(")");
            LOG.debug("{}", sql);

            try (final Statement stmt = conn.createStatement()) {
                stmt.executeUpdate(sql.toString());
            }
        }
    }

    private int executeInsert(final InsertQuery insertQuery) throws SQLException {
        final List<Parameter> values = insertQuery.getValues();

        try (final SqlBuilder sql = new SqlBuilder(conn)) {
            sql.append("INSERT INTO ");
            sql.appendIdentifier(insertQuery.getTableName());
            sql.append(" (");

            boolean first = true;
            for (final Parameter value : values) {
                if (!first) {
                    sql.append(",");
                }
                sql.appendIdentifier(value.getColumnName());
                first = false;
            }

            sql.append(") VALUES (");

            for (int i = 0; i < values.size(); i++) {
                if (i > 0) {
                    sql.append(",");
                }
                sql.append("?");
            }

            sql.append(")");

            LOG.debug("{}", sql);

            try (final PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
                int i = 1;
                for (final Parameter value : values) {
                    stmt.setObject(i++, value.getValue(), value.getValueType());
                }
                return stmt.executeUpdate();
            }
        }
    }

    private int executeUpdate(final UpdateQuery updateQuery) throws SQLException {
        final List<Parameter> values = updateQuery.getValues();
        final List<Parameter> conditions = updateQuery.getConditions();

        try (final SqlBuilder sql = new SqlBuilder(conn)) {
            sql.append("UPDATE ");
            sql.appendIdentifier(updateQuery.getTableName());
            sql.append(" SET ");

            boolean first = true;
            for (final Parameter value : values) {
                if (!first) {
                    sql.append(",");
                }
                sql.appendIdentifier(value.getColumnName());
                sql.append("=?");
                first = false;
            }

            first = true;
            for (final Parameter condition : conditions) {
                if (first) {
                    sql.append(" WHERE ");
                } else {
                    sql.append(" AND ");
                }
                sql.appendIdentifier(condition.getColumnName());
                sql.append("=?");
                first = false;
            }

            LOG.debug("{}", sql);

            try (final PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
                int i = 1;
                for (final Parameter value : values) {
                    stmt.setObject(i++, value.getValue(), value.getValueType());
                }
                for (final Parameter condition : conditions) {
                    stmt.setObject(i++, condition.getValue(), condition.getValueType());
                }
                return stmt.executeUpdate();
            }
        }
    }
}
