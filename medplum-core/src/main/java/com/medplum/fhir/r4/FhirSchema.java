package com.medplum.fhir.r4;

import java.util.ArrayList;
import java.util.List;
import java.util.Map.Entry;

import jakarta.json.JsonArray;
import jakarta.json.JsonObject;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;

import com.medplum.fhir.r4.types.CodeableConcept;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.fhir.r4.types.OperationOutcome.OperationOutcomeIssue;
import com.medplum.util.JsonUtils;

public class FhirSchema {
    private static final String FILENAME = "fhir/r4/fhir.schema.json";
    private static final JsonObject schema;
    private static final JsonObject definitions;
    private static final List<String> resourceTypes;

    static {
        schema = JsonUtils.readJsonResourceFile(FILENAME);
        definitions = schema.getJsonObject("definitions");
        resourceTypes = new ArrayList<>(schema.getJsonObject("discriminator").getJsonObject("mapping").keySet());
    }

    public static JsonObject getSchema() {
        return schema;
    }

    public static JsonObject getDefinitions() {
        return definitions;
    }

    public static List<String> getResourceTypes() {
        return resourceTypes;
    }

    public static JsonObject getResourceTypeSchema(final String resourceType) {
        return definitions.getJsonObject(resourceType);
    }

    public static OperationOutcome validate(final String resourceType) {
        if (resourceType == null || resourceType.isBlank()) {
            return error("Resource type is null");
        }

        final JsonObject definition = getResourceTypeSchema(resourceType);
        if (definition == null) {
            return error("Unknown resource type '" + resourceType + "'");
        }

        return StandardOutcomes.ok();
    }

    public static OperationOutcome validate(final JsonObject resource) {
        if (resource == null) {
            return error("Resource is null");
        }

        final String resourceType = resource.getString("resourceType", "");
        if (resourceType.isBlank()) {
            return error("Missing resource type");
        }

        final JsonObject definition = getResourceTypeSchema(resourceType);
        if (definition == null) {
            return error("Unknown resource type '" + resourceType + "'");
        }

        final List<OperationOutcomeIssue> issues = new ArrayList<>();
        final JsonObject propertyDefinitions = definition.getJsonObject("properties");
        for (final Entry<String, JsonValue> propertyDefinition : propertyDefinitions.entrySet()) {
            final String propertyName = propertyDefinition.getKey();
            if (!resource.containsKey(propertyName)) {
                continue;
            }

            final JsonObject propertyDetails = (JsonObject) propertyDefinition.getValue();
            final OperationOutcomeIssue issue = validateProperty(resource, propertyName, propertyDetails);
            if (issue != null) {
                issues.add(issue);
            }
        }

        for (final Entry<String, JsonValue> actualProperty : resource.entrySet()) {
            final String propertyName = actualProperty.getKey();
            if (propertyName.equals("meta")) {
                continue;
            }
            if (!propertyDefinitions.containsKey(propertyName)) {
                issues.add(issue("Invalid additional property '" + propertyName + "'"));
            }
        }

        final JsonArray requiredProperties = definition.getJsonArray("required");
        if (requiredProperties != null) {
            for (final JsonValue requiredProperty : requiredProperties) {
                final String propertyName = ((JsonString) requiredProperty).getString();
                if (!resource.containsKey(propertyName)) {
                    issues.add(issue("Missing required property '" + propertyName + "'"));
                }
            }
        }

        return issues.isEmpty() ? StandardOutcomes.ok() : error(issues);
    }

    private static OperationOutcomeIssue validateProperty(final JsonObject resource, final String propertyName, final JsonObject propertyDetails) {
        return null;
    }

    private static OperationOutcomeIssue issue(final String msg) {
        return OperationOutcomeIssue.create()
                .severity(StandardOutcomes.SEVERITY_ERROR)
                .code(StandardOutcomes.CODE_INVALID)
                .details(CodeableConcept.create().text(msg).build())
                .build();
    }

    private static OperationOutcome error(final String msg) {
        return StandardOutcomes.invalid(msg);
    }

    private static OperationOutcome error(final List<OperationOutcomeIssue> issues) {
        return StandardOutcomes.error(StandardOutcomes.CODE_INVALID, issues);
    }
}
