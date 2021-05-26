package com.medplum.fhir.r4;

import java.util.ArrayList;
import java.util.List;

import jakarta.json.JsonObject;
import jakarta.json.JsonString;
import jakarta.json.JsonValue.ValueType;

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

    FhirSchema() {
        throw new UnsupportedOperationException();
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

        final var resourceType = resource.getString("resourceType", "");
        if (resourceType.isBlank()) {
            return error("Missing resource type");
        }

        final var definition = getResourceTypeSchema(resourceType);
        if (definition == null) {
            return error("Unknown resource type '" + resourceType + "'");
        }

        final var issues = new ArrayList<OperationOutcomeIssue>();
        final var propertyDefinitions = definition.getJsonObject("properties");

        checkProperties(resource, propertyDefinitions, issues);
        checkAdditionalProperties(resource, propertyDefinitions, issues);
        checkRequiredProperties(resource, definition, issues);

        return issues.isEmpty() ? StandardOutcomes.ok() : error(issues);
    }

    private static void checkProperties(
            final JsonObject resource,
            final JsonObject propertyDefinitions,
            final List<OperationOutcomeIssue> issues) {

        for (final var propertyDefinition : propertyDefinitions.entrySet()) {
            final var propertyName = propertyDefinition.getKey();
            if (!resource.containsKey(propertyName)) {
                continue;
            }

            checkProperty(
                    resource,
                    propertyName,
                    (JsonObject) propertyDefinition.getValue(),
                    issues);
        }
    }

    private static void checkProperty(
            final JsonObject resource,
            final String propertyName,
            final JsonObject propertyDetails,
            final List<OperationOutcomeIssue> issues) {

        final var propertyType = propertyDetails.getString("type", "");
        final var value = resource.get(propertyName);

        if (propertyType.equals("array") && value.getValueType() != ValueType.ARRAY) {
            issues.add(issue("Expected array for property '" + propertyName + "'"));
        }
    }

    private static void checkAdditionalProperties(
            final JsonObject resource,
            final JsonObject propertyDefinitions,
            final List<OperationOutcomeIssue> issues) {

        for (final var actualProperty : resource.entrySet()) {
            final var propertyName = actualProperty.getKey();
            if (propertyName.equals("meta") || propertyName.equals("_baseDefinition")) {
                continue;
            }
            if (!propertyDefinitions.containsKey(propertyName)) {
                issues.add(issue("Invalid additional property '" + propertyName + "'"));
            }
        }
    }

    private static void checkRequiredProperties(
            final JsonObject resource,
            final JsonObject definition,
            final List<OperationOutcomeIssue> issues) {

        final var requiredProperties = definition.getJsonArray("required");
        if (requiredProperties != null) {
            for (final var requiredProperty : requiredProperties) {
                final var propertyName = ((JsonString) requiredProperty).getString();
                if (!resource.containsKey(propertyName)) {
                    issues.add(issue("Missing required property '" + propertyName + "'"));
                }
            }
        }
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
        return StandardOutcomes.error(issues);
    }
}
