package com.medplum.generator;

import java.io.IOException;
import java.io.InputStream;
import java.util.*;
import java.util.Map.Entry;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonValue;
import jakarta.json.stream.JsonParser;

public class Generator {
    public static final Map<String, FhirType> FHIR_TYPES = new HashMap<>();
    public static final List<String> BASE_RESOURCE_PROPERTIES = Arrays.asList("resourceType", "id", "meta", "implicitRules", "language");
    public static final List<String> DOMAIN_RESOURCE_PROPERTIES = Arrays.asList("text", "contained", "extension", "modifierExtension");

    public static void main(final String[] args) throws IOException {
        final JsonObject schema = readJson("fhir/r4/fhir.schema.json");
        final JsonObject definitions = schema.getJsonObject("definitions");

        JavaGenerator.mkdirs();
        TypeScriptGenerator.mkdirs();

        final List<FhirType> fhirTypes = new ArrayList<>();
        for (final String resourceType : definitions.keySet()) {
            final FhirType fhirType = buildType(
                    resourceType,
                    definitions.getJsonObject(resourceType));

            if (fhirType != null) {
                fhirTypes.add(fhirType);
                FHIR_TYPES.put(fhirType.getOutputName(), fhirType);
            }
        }

        final Map<String, FhirType> parentTypes = new HashMap<>();
        for (final FhirType fhirType : fhirTypes) {
            if (fhirType.getParentType() == null) {
                parentTypes.put(fhirType.getOutputName(), fhirType);
            }
        }

        for (final FhirType fhirType : fhirTypes) {
            if (fhirType.getParentType() != null) {
                parentTypes.get(fhirType.getParentType()).getSubTypes().add(fhirType);
            }
        }

        final List<FhirType> outputTypes = new ArrayList<>(parentTypes.values());
        outputTypes.sort(Comparator.comparing(FhirType::getOutputName));

        JavaGenerator.writePropertyNames(fhirTypes);
        TypeScriptGenerator.writeIndexFile(outputTypes);
        TypeScriptGenerator.writeResourceFile(outputTypes);

        for (final FhirType outputType : outputTypes) {
            JavaGenerator.writeMainFile(outputType);
            TypeScriptGenerator.writeMainFile(outputType);
        }

        for (final FhirType outputType : fhirTypes) {
            JavaGenerator.writeTestFile(outputType);
        }
    }

    private static JsonObject readJson(final String filename) {
        try (final InputStream in = Generator.class.getClassLoader().getResourceAsStream(filename);
                final JsonParser parser = Json.createParser(in)) {
            parser.next();
            return parser.getObject();
        } catch (final IOException ex) {
            throw new RuntimeException(ex);
        }
    }

    private static FhirType buildType(final String resourceType, final JsonObject typeDefinition) throws IOException {
        if (typeDefinition == null) {
            throw new RuntimeException("Resource type '" + resourceType + "' type definition is null");
        }

        final JsonObject propertyDefinitions = typeDefinition.getJsonObject("properties");
        if (propertyDefinitions == null) {
            return null;
        }

        final String parentType;
        final String outputName;
        if (resourceType.contains("_")) {
            final String[] parts = resourceType.split("_");
            parentType = parts[0];
            outputName = parts[0] + parts[1];
        } else {
            parentType = null;
            outputName = resourceType;
        }

        final FhirType result = new FhirType(typeDefinition, resourceType, parentType, outputName);
        final Set<String> propertyNames = new HashSet<>();

        for (final Entry<String, JsonValue> propertyDefinition : propertyDefinitions.entrySet()) {
            final String inputName = propertyDefinition.getKey();
            if (inputName.startsWith("_")) {
                continue;
            }

            result.getProperties().add(new Property(resourceType, inputName, propertyDefinition.getValue().asJsonObject()));
            propertyNames.add(inputName);
        }

        if (propertyNames.containsAll(BASE_RESOURCE_PROPERTIES)) {
            result.setResource(true);

            if (propertyNames.containsAll(DOMAIN_RESOURCE_PROPERTIES)) {
                result.setDomainResource(true);
            }
        }

        return result;
    }
}
