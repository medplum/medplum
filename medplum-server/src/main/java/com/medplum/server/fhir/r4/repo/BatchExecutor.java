package com.medplum.server.fhir.r4.repo;

import static com.medplum.util.IdUtils.*;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.json.Json;
import jakarta.json.JsonArray;
import jakarta.json.JsonObject;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;
import jakarta.ws.rs.core.Response.Status;

import com.medplum.fhir.r4.StandardOutcomes;
import com.medplum.fhir.r4.types.Bundle;
import com.medplum.fhir.r4.types.Bundle.BundleEntry;
import com.medplum.fhir.r4.types.Bundle.BundleResponse;
import com.medplum.fhir.r4.types.FhirResource;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.server.security.SecurityUser;

public class BatchExecutor {
    private final Repository repo;

    public BatchExecutor(final Repository repo) {
        this.repo = repo;
    }

    public OperationOutcome createBatch(final SecurityUser user, final Bundle bundle) {
        final String bundleType = bundle.type();
        if (bundleType == null || bundleType.isBlank()) {
            return StandardOutcomes.invalid("Missing bundle type");
        }

        if (!bundleType.equals("batch") && !bundleType.equals("transaction")) {
            return StandardOutcomes.invalid("Unrecognized bundle type '" + bundleType + "'");
        }

        final var entries = bundle.entry();
        if (entries == null) {
            return StandardOutcomes.invalid("Missing bundle entry");
        }

        final var ids = findIds(entries);
        if (!ids.isEmpty() && !bundleType.equals("transaction")) {
            return StandardOutcomes.invalid("Can only use local IDs ('urn:uuid:') in transaction");
        }

        final var result = new ArrayList<BundleEntry>();
        for (final var entry : new Bundle(rewriteIdsInObject(bundle, ids)).entry()) {
            final var resource = entry.resource(FhirResource.class);
            final var providedId = resource.id();
            final var entryOutcome = providedId == null || providedId.isBlank() ?
                    repo.create(user, resource) :
                    repo.update(user, providedId, resource);

            result.add(BundleEntry.create()
                    .response(BundleResponse.create()
                            .status(Status.fromStatusCode(entryOutcome.status()).toString())
                            .location(URI.create(entryOutcome.resource().createReference().reference()))
                            .build())
                    .build());
        }

        return StandardOutcomes.ok(Bundle.create().type(bundleType + "-response").entry(result).build());
    }

    private static Map<String, String> findIds(final List<BundleEntry> entries) {
        final var result = new HashMap<String, String>();

        for (final var entry : entries) {
            if (entry.fullUrl() == null) {
                continue;
            }

            final var fullUrl = entry.fullUrl().toString();
            if (!fullUrl.startsWith("urn:uuid:")) {
                continue;
            }

            // Direct ID: replace local value with generated ID
            final var inputId = fullUrl.substring("urn:uuid:".length());
            final var outputId = generateId();
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
        final var b = Json.createArrayBuilder();
        for (final var value : input) {
            b.add(rewriteIds(value, ids));
        }
        return b.build();
    }

    private static JsonObject rewriteIdsInObject(final JsonObject input, final Map<String, String> ids) {
        final var b = Json.createObjectBuilder();
        for (final var entry : input.entrySet()) {
            b.add(entry.getKey(), rewriteIds(entry.getValue(), ids));
        }
        return b.build();
    }

    private static JsonString rewriteIdsInString(final JsonString input, final Map<String, String> ids) {
        final var inputStr = input.getString();
        final var outputStr = ids.get(inputStr);
        return outputStr != null ? Json.createValue(outputStr) : input;
    }
}
