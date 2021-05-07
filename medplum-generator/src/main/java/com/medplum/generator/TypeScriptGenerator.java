package com.medplum.generator;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import jakarta.json.JsonObject;
import jakarta.json.JsonValue;

public class TypeScriptGenerator {
    private static final String INDENT = " ".repeat(2);
    private static final String OUTPUT_PATH = "../medplum-ts/src/fhir/";

    public static void mkdirs() {
        new File(OUTPUT_PATH).mkdirs();
    }

    public static void writeIndexFile(final List<FhirType> parentTypes) throws IOException {
        final List<String> sortedTypes = new ArrayList<>();
        for (final FhirType parentType : parentTypes) {
            sortedTypes.add(parentType.getOutputName());
        }
        sortedTypes.add("Resource");
        Collections.sort(sortedTypes);

        final FileBuilder b = new FileBuilder(INDENT);

        for (final String resourceType : sortedTypes) {
            b.append("export * from './" + resourceType + "';");
        }

        Files.writeString(Path.of(OUTPUT_PATH + "index.ts"), b.toString());
    }

    public static void writeResourceFile(final Collection<FhirType> parentTypes) throws IOException {
        final List<String> sortedTypes = new ArrayList<>();
        for (final FhirType parentType : parentTypes) {
            if (parentType.getParentType() == null && parentType.isResource()) {
                sortedTypes.add(parentType.getOutputName());
            }
        }
        Collections.sort(sortedTypes);

        final FileBuilder b = new FileBuilder(INDENT);

        for (final String resourceType : sortedTypes) {
            b.append("import { " + resourceType + " } from './" + resourceType + "';");
        }

        b.newLine();
        b.append("export type Resource = " + sortedTypes.get(0));
        b.increaseIndent();

        for (int i = 1; i < sortedTypes.size(); i++) {
            final String suffix = i == sortedTypes.size() - 1 ? ";" : "";
            b.append("| " + sortedTypes.get(i) + suffix);
        }

        b.decreaseIndent();

        Files.writeString(Path.of(OUTPUT_PATH + "Resource.ts"), b.toString());
    }

    public static void writeMainFile(final FhirType fhirType) throws IOException {
        final FileBuilder b = new FileBuilder(INDENT);

        final Set<String> includedTypes = new HashSet<>();
        final Set<String> referencedTypes = new HashSet<>();
        buildImports(fhirType, includedTypes, referencedTypes);

        final List<String> sortedReferencedTypes = new ArrayList<>(referencedTypes);
        Collections.sort(sortedReferencedTypes);
        for (final String referencedType : sortedReferencedTypes) {
            if (!includedTypes.contains(referencedType)) {
                b.append("import { " + referencedType + " } from './" + referencedType + "';");
            }
        }

        writeClass(b, fhirType, true);
        Files.writeString(Path.of(OUTPUT_PATH + fhirType.getOutputName() + ".ts"), b.toString());
    }

    private static void buildImports(final FhirType fhirType, final Set<String> includedTypes, final Set<String> referencedTypes) {
        includedTypes.add(fhirType.getOutputName());

        for (final Property property : fhirType.getProperties()) {
            final String cleanName = cleanReferencedType(getTypeScriptType(property));
            if (cleanName != null) {
                referencedTypes.add(cleanName);
            }
        }

        for (final FhirType subType : fhirType.getSubTypes()) {
            buildImports(subType, includedTypes, referencedTypes);
        }
    }

    private static String cleanReferencedType(final String typeName) {
        if (typeName.startsWith("'")) {
            return null;
        }

        if (Character.isLowerCase(typeName.charAt(0))) {
            return null;
        }

        if (typeName.equals("Date") || typeName.equals("Date[]")) {
            return null;
        }

        if (typeName.endsWith("[]")) {
            return typeName.replace("[]", "");
        }

        return typeName;
    }

    private static void writeClass(final FileBuilder b, final FhirType fhirType, final boolean topLevel) {
        final String resourceType = fhirType.getOutputName();

        b.newLine();
        JavadocGenerator.generateJavadoc(b, fhirType.getTypeDef().getString("description"));
        b.append("export interface " + resourceType + " {");
        b.increaseIndent();

        for (final Property property : fhirType.getProperties()) {
            final String propertyName = property.getName();
            final String typeName = getTypeScriptType(property);

            b.newLine();
            JavadocGenerator.generateJavadoc(b, property.getDescription());

            if (propertyName.equals("resourceType")) {
                b.append("readonly " + propertyName + ": " + typeName + ";");
            } else {
                b.append("readonly " + propertyName + "?: " + typeName + ";");
            }
        }

        b.decreaseIndent();
        b.append("}");

        Collections.sort(fhirType.getSubTypes(), (o1, o2) -> o1.getOutputName().compareTo(o2.getOutputName()));

        for (final FhirType subType : fhirType.getSubTypes()) {
            b.newLine();
            writeClass(b, subType, false);
        }
    }

    private static String getTypeScriptType(final Property property) {
        final String constValue = property.getDefinition().getString("const", null);
        if (constValue != null) {
            return "'" + constValue + "'";
        }

        if (property.getResourceType().equals("OperationOutcome") && property.getName().equals("resource")) {
            return "Resource";
        }

        final String typeValue = property.getDefinition().getString("type", null);
        if (typeValue != null) {
            if (typeValue.equals("array")) {
                final JsonObject itemDefinition = property.getDefinition().getJsonObject("items");
                if (itemDefinition != null && itemDefinition.containsKey("$ref")) {
                    return getTypeScriptTypeFromDefinition(itemDefinition.getString("$ref")) + "[]";
                } else if (itemDefinition != null && itemDefinition.containsKey("enum")) {
                    return "string[]";
                } else {
                    return "any[]";
                }

            } else {
                return getTypeScriptTypeFromDefinition(typeValue);
            }
        }

        final JsonValue enumValue = property.getDefinition().get("enum");
        if (enumValue != null) {
            return "string";
        }

        final String ref = property.getDefinition().getString("$ref", null);
        if (ref != null) {
            return getTypeScriptTypeFromDefinition(ref);
        }

        System.out.println("unhandled property definition:");
        System.out.println(property.getDefinition().toString());
        return "any";
    }

    private static String getTypeScriptTypeFromDefinition(String ref) {
        if (ref.startsWith("#/definitions/")) {
            ref = ref.replace("#/definitions/", "");
        }

        switch (ref) {
        case "boolean":
            return "boolean";

        case "base64Binary":
        case "canonical":
        case "code":
        case "id":
        case "markdown":
        case "string":
        case "uri":
        case "url":
        case "xhtml":
            return "string";

        case "date":
        case "dateTime":
        case "instant":
        case "time":
            return "Date";

        case "decimal":
        case "integer":
        case "positiveInt":
        case "unsignedInt":
        case "number":
            return "number";

        case "ResourceList":
            return "Resource";
        }

        return ref.replaceAll("_", "");
    }
}
