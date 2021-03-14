package com.medplum.server.fhir.repo;

import static com.medplum.fhir.IdUtils.*;

import java.io.Closeable;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.UUID;

import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonArray;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.json.JsonPatch;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;
import jakarta.json.JsonValue.ValueType;
import jakarta.ws.rs.core.Response.Status;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.FhirPath;
import com.medplum.fhir.FhirSchema;
import com.medplum.fhir.JsonUtils;
import com.medplum.fhir.StandardOperations;
import com.medplum.fhir.types.Bundle;
import com.medplum.fhir.types.Bundle.BundleEntry;
import com.medplum.fhir.types.Bundle.BundleResponse;
import com.medplum.fhir.types.FhirResource;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.fhir.types.Reference;
import com.medplum.fhir.types.SearchParameter;
import com.medplum.server.search.Filter;
import com.medplum.server.search.SearchParameters;
import com.medplum.server.search.SearchRequest;
import com.medplum.server.search.SortRule;
import com.medplum.server.security.SecurityUser;

public class JdbcRepository implements Repository, Closeable {
    private static final Logger LOG = LoggerFactory.getLogger(JdbcRepository.class);
    private static final String COLUMN_ID = "ID";
    private static final String COLUMN_VERSION_ID = "VERSIONID";
    private static final String COLUMN_LAST_UPDATED = "LASTUPDATED";
    private static final String COLUMN_CONTENT = "CONTENT";
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
        try (final Statement stmt = conn.createStatement()) {
            final List<SearchParameter> searchParams = SearchParameters.getParameters(resourceType);

            final StringBuilder sql = new StringBuilder();
            sql.append("CREATE TABLE IF NOT EXISTS ");
            sql.append(stmt.enquoteIdentifier(getTableName(resourceType), true));
            sql.append(" (");
            sql.append(COLUMN_ID + " BINARY(16) NOT NULL PRIMARY KEY,");
            sql.append(COLUMN_LAST_UPDATED + " DATETIME NOT NULL,");
            sql.append(COLUMN_CONTENT + " TEXT NOT NULL");

            for (final SearchParameter searchParam : searchParams) {
                sql.append(",");
                sql.append(stmt.enquoteIdentifier(getColumnName(searchParam.code()), true));
                sql.append(" VARCHAR(128)");
            }

            sql.append(")");

            LOG.debug("{}", sql);

            stmt.executeUpdate(sql.toString());
        }
    }

    private void createHistoryTable(final String resourceType) throws SQLException {
        try (final Statement stmt = conn.createStatement()) {
            final StringBuilder sql = new StringBuilder();
            sql.append("CREATE TABLE IF NOT EXISTS ");
            sql.append(stmt.enquoteIdentifier(getHistoryTableName(resourceType), true));
            sql.append(" (");
            sql.append(COLUMN_VERSION_ID + " BINARY(16) NOT NULL PRIMARY KEY,");
            sql.append(COLUMN_ID + " BINARY(16) NOT NULL,");
            sql.append(COLUMN_LAST_UPDATED + " DATETIME NOT NULL,");
            sql.append(COLUMN_CONTENT + " TEXT NOT NULL");
            sql.append(")");

            LOG.debug("{}", sql);

            stmt.executeUpdate(sql.toString());
        }
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
            sql.append("SELECT " + COLUMN_CONTENT + " FROM ");
            sql.append(formatter.enquoteIdentifier(getTableName(resourceType), true));
            sql.append(" WHERE " + COLUMN_ID + "=?");

            final PreparedStatement stmt = conn.prepareStatement(sql.toString());
            stmt.setObject(1, uuid, Types.BINARY);

            LOG.debug("{}", sql);

            final ResultSet rs = stmt.executeQuery();
            if (rs.next()) {
                final String content = rs.getString(1);
                final JsonObject data = JsonUtils.readJsonString(content);
                return StandardOperations.ok(data);
            } else {
                return StandardOperations.notFound();
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
            sql.append("SELECT " + COLUMN_CONTENT + " FROM ");
            sql.append(formatter.enquoteIdentifier(getHistoryTableName(resourceType), true));
            sql.append(" WHERE " + COLUMN_ID + "=?");

            LOG.debug("{}", sql);

            final PreparedStatement stmt = conn.prepareStatement(sql.toString());
            stmt.setObject(1, uuid, Types.BINARY);

            final ResultSet rs = stmt.executeQuery();
            final List<BundleEntry> results = new ArrayList<>();
            while (rs.next()) {
                final String content = rs.getString(1);
                final JsonObject data = JsonUtils.readJsonString(content);
                results.add(BundleEntry.create().resource(data).build());
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
            sql.append("SELECT " + COLUMN_CONTENT + " FROM ");
            sql.append(formatter.enquoteIdentifier(getHistoryTableName(resourceType), true));
            sql.append(" WHERE " + COLUMN_ID + "=?");
            sql.append(" AND " + COLUMN_VERSION_ID + "=?");

            final PreparedStatement stmt = conn.prepareStatement(sql.toString());
            stmt.setObject(1, uuid, Types.BINARY);
            stmt.setObject(2, versionUuid, Types.BINARY);

            LOG.debug("{}", sql);

            final ResultSet rs = stmt.executeQuery();
            if (rs.next()) {
                final String content = rs.getString(1);
                final JsonObject data = JsonUtils.readJsonString(content);
                return StandardOperations.ok(data);
            } else {
                return StandardOperations.notFound();
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

        final List<SearchParameter> searchParams = SearchParameters.getParameters(resourceType);

        try (final Statement formatter = conn.createStatement()) {
            final StringBuilder sql = new StringBuilder();
            sql.append("INSERT INTO ");
            sql.append(formatter.enquoteIdentifier(getTableName(resourceType), true));
            sql.append(" (" + COLUMN_ID + "," + COLUMN_LAST_UPDATED + "," + COLUMN_CONTENT);

            for (final SearchParameter searchParam : searchParams) {
                sql.append(",");
                sql.append(formatter.enquoteIdentifier(getColumnName(searchParam.code()), true));
            }

            sql.append(") VALUES (?,?,?");

            for (int i = 0; i < searchParams.size(); i++) {
                sql.append(",?");
            }

            sql.append(")");

            LOG.debug("{}", sql);

            try (final PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
                int i = 1;
                stmt.setObject(i++, id, Types.BINARY);
                stmt.setObject(i++, lastUpdated, Types.TIMESTAMP);
                stmt.setString(i++, resource.toString());

                for (final SearchParameter param : searchParams) {
                    stmt.setString(i++, evalAsString(param.expression(), resource));
                }

                stmt.executeUpdate();
                writeVersion(resourceType, id, versionId, lastUpdated, resource);
                conn.commit();
            }

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

        final List<SearchParameter> searchParams = SearchParameters.getParameters(resourceType);

        try (final Statement formatter = conn.createStatement()) {
            final StringBuilder sql = new StringBuilder();
            sql.append("UPDATE ");
            sql.append(formatter.enquoteIdentifier(getTableName(resourceType), true));
            sql.append(" SET " + COLUMN_LAST_UPDATED + "=?, " + COLUMN_CONTENT + "=?");

            for (final SearchParameter searchParam : searchParams) {
                sql.append(",");
                sql.append(formatter.enquoteIdentifier(getColumnName(searchParam.code()), true));
                sql.append("=?");
            }

            sql.append(" WHERE " + COLUMN_ID + "=?");

            LOG.debug("{}", sql);

            try (final PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
                int i = 1;
                stmt.setObject(i++, lastUpdated, Types.TIMESTAMP);
                stmt.setString(i++, resource.toString());

                for (final SearchParameter param : searchParams) {
                    stmt.setString(i++, evalAsString(param.expression(), resource));
                }

                stmt.setObject(i++, id, Types.BINARY);
                stmt.executeUpdate();
                writeVersion(resourceType, id, versionId, lastUpdated, resource);
                conn.commit();
            }
            return StandardOperations.created(resource);

        } catch (final SQLException ex) {
            LOG.error("Error updating resource: {}", ex.getMessage(), ex);
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

        try (final Statement formatter = conn.createStatement()) {
            final StringBuilder sql = new StringBuilder();
            sql.append("INSERT INTO ");
            sql.append(formatter.enquoteIdentifier(getHistoryTableName(resourceType), true));
            sql.append(" (" + COLUMN_VERSION_ID + "," + COLUMN_ID + "," + COLUMN_LAST_UPDATED + "," + COLUMN_CONTENT + ") VALUES (?,?,?,?)");

            LOG.debug("{}", sql);

            try (final PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
                int i = 1;
                stmt.setObject(i++, versionId, Types.BINARY);
                stmt.setObject(i++, id, Types.BINARY);
                stmt.setObject(i++, lastUpdated, Types.TIMESTAMP);
                stmt.setString(i++, resource.toString());
                stmt.executeUpdate();
            }
        }
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
            sql.append("SELECT " + COLUMN_CONTENT + " FROM ");
            sql.append(formatter.enquoteIdentifier(getTableName(searchRequest.getResourceType()), true));

            boolean first = true;
            for (final Filter filter : searchRequest.getFilters()) {
                sql.append(first ? " WHERE " : " AND ");
                sql.append(formatter.enquoteIdentifier(getColumnName(filter.getSearchParam().code()), true));
                sql.append("=?");
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

            final PreparedStatement stmt = conn.prepareStatement(sql.toString());
            int i = 1;
            for (final Filter filter : searchRequest.getFilters()) {
                if (filter.getSearchParam().code().equals("_id")) {
                    stmt.setObject(i, UUID.fromString(filter.getValue()), Types.BINARY);
                } else {
                    stmt.setString(i, filter.getValue());
                }
                i++;
            }

            final ResultSet rs = stmt.executeQuery();
            final List<BundleEntry> results = new ArrayList<>();
            while (rs.next()) {
                final String content = rs.getString(1);
                final JsonObject data = JsonUtils.readJsonString(content);
                results.add(BundleEntry.create().resource(data).build());
            }

            return StandardOperations.ok(Bundle.create().type("searchset").entry(results).build());

        } catch (final SQLException ex) {
            LOG.error("Error searching: {}", ex.getMessage(), ex);
            return StandardOperations.invalid(ex.getMessage());
        }
    }

    @Override
    public OperationOutcome createBatch(final SecurityUser user, final JsonObject data) {
        final Bundle bundle = new Bundle(data);

        final String bundleType = bundle.type();
        if (bundleType == null || bundleType.isBlank()) {
            return StandardOperations.invalid("Missing bundle type");
        }

        if (!bundleType.equals("batch") && !bundleType.equals("transaction")) {
            return StandardOperations.invalid("Unrecognized bundle type '" + bundleType + "'");
        }

        final List<BundleEntry> entries = bundle.entry();
        if (entries == null) {
            return StandardOperations.invalid("Missing bundle entry");
        }

        final Map<String, String> ids = findIds(entries);
        if (!ids.isEmpty() && !bundleType.equals("transaction")) {
            return StandardOperations.invalid("Can only use local IDs ('urn:uuid:') in transaction");
        }

        final List<BundleEntry> result = new ArrayList<>();
        for (final BundleEntry entry : new Bundle(rewriteIdsInObject(data, ids)).entry()) {
            final FhirResource resource = entry.resource(FhirResource.class);
            final String resourceType = resource.resourceType();
            final String providedId = resource.id();
            final OperationOutcome entryOutcome = providedId == null || providedId.isBlank() ?
                    create(user, resourceType, resource) :
                    update(user, resourceType, providedId, resource);
            result.add(BundleEntry.create()
                    .response(BundleResponse.create()
                            .status(Status.fromStatusCode(entryOutcome.status()).toString())
                            .location(entryOutcome.resource().createReference().reference())
                            .build())
                    .build());
        }

        return StandardOperations.ok(Bundle.create().type(bundleType + "-response").entry(result).build());
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

    private static UUID tryParseId(final String id) {
        if (id == null || id.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(id);
        } catch (final IllegalArgumentException ex) {
            return null;
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

    private static Map<String, String> findIds(final List<BundleEntry> entries) {
        final Map<String, String> result = new HashMap<>();

        for (final BundleEntry entry : entries) {
            final String fullUrl = entry.fullUrl();
            if (fullUrl == null || !fullUrl.startsWith("urn:uuid:")) {
                continue;
            }

            // Direct ID: replace local value with generated ID
            final String inputId = fullUrl.substring("urn:uuid:".length());
            final String outputId = generateId();
            result.put(inputId, outputId);

            // Reference: replace prefixed value with reference string
            result.put(fullUrl, entry.resource(FhirResource.class).resourceType() + "/" + outputId);
        }

        return result;
    }

    private static JsonValue rewriteIds(final JsonValue input, final Map<String, String> ids) {
        switch (input.getValueType()) {
        case ARRAY:
            return rewriteIdsInArray(input.asJsonArray(), ids);
        case OBJECT:
            return rewriteIdsInObject(input.asJsonObject(), ids);
        case STRING:
            return rewriteIdsInString((JsonString) input, ids);
        default:
            return input;
        }
    }

    private static JsonArray rewriteIdsInArray(final JsonArray input, final Map<String, String> ids) {
        final JsonArrayBuilder b = Json.createArrayBuilder();
        for (final JsonValue value : input) {
            b.add(rewriteIds(value, ids));
        }
        return b.build();
    }

    private static JsonObject rewriteIdsInObject(final JsonObject input, final Map<String, String> ids) {
        final JsonObjectBuilder b = Json.createObjectBuilder();
        for (final Entry<String, JsonValue> entry : input.entrySet()) {
            b.add(entry.getKey(), rewriteIds(entry.getValue(), ids));
        }
        return b.build();
    }

    private static JsonString rewriteIdsInString(final JsonString input, final Map<String, String> ids) {
        final String inputStr = input.getString();
        final String outputStr = ids.get(inputStr);
        return outputStr != null ? Json.createValue(outputStr) : input;
    }
}
