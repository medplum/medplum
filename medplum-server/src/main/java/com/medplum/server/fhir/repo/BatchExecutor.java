package com.medplum.server.fhir.repo;

import static com.medplum.fhir.IdUtils.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;

import jakarta.json.Json;
import jakarta.json.JsonArray;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;
import jakarta.ws.rs.core.Response.Status;

import com.medplum.fhir.StandardOutcomes;
import com.medplum.fhir.types.Bundle;
import com.medplum.fhir.types.Bundle.BundleEntry;
import com.medplum.fhir.types.Bundle.BundleResponse;
import com.medplum.fhir.types.FhirResource;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.server.security.SecurityUser;

public class BatchExecutor {
    private final Repository repo;

    public BatchExecutor(final Repository repo) {
        this.repo = repo;
    }

    public OperationOutcome createBatch(final SecurityUser user, final JsonObject data) {
        final Bundle bundle = new Bundle(data);

        final String bundleType = bundle.type();
        if (bundleType == null || bundleType.isBlank()) {
            return StandardOutcomes.invalid("Missing bundle type");
        }

        if (!bundleType.equals("batch") && !bundleType.equals("transaction")) {
            return StandardOutcomes.invalid("Unrecognized bundle type '" + bundleType + "'");
        }

        final List<BundleEntry> entries = bundle.entry();
        if (entries == null) {
            return StandardOutcomes.invalid("Missing bundle entry");
        }

        final Map<String, String> ids = findIds(entries);
        if (!ids.isEmpty() && !bundleType.equals("transaction")) {
            return StandardOutcomes.invalid("Can only use local IDs ('urn:uuid:') in transaction");
        }

        final List<BundleEntry> result = new ArrayList<>();
        for (final BundleEntry entry : new Bundle(rewriteIdsInObject(data, ids)).entry()) {
            final FhirResource resource = entry.resource(FhirResource.class);
            final String providedId = resource.id();
            final OperationOutcome entryOutcome = providedId == null || providedId.isBlank() ?
                    repo.create(user, resource) :
                    repo.update(user, providedId, resource);
            result.add(BundleEntry.create()
                    .response(BundleResponse.create()
                            .status(Status.fromStatusCode(entryOutcome.status()).toString())
                            .location(entryOutcome.resource().createReference().reference())
                            .build())
                    .build());
        }

        return StandardOutcomes.ok(Bundle.create().type(bundleType + "-response").entry(result).build());
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
