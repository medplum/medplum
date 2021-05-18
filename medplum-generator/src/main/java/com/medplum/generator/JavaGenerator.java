package com.medplum.generator;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import jakarta.json.JsonObject;
import jakarta.json.JsonValue;

import org.apache.commons.text.CaseUtils;
import org.apache.commons.text.WordUtils;

public class JavaGenerator {
    private static final String INDENT = " ".repeat(4);
    private static final String OUTPUT_PACKAGE = "com.medplum.fhir.r4";
    private static final String OUTPUT_PATH = "../medplum-core/src/main/java/com/medplum/fhir/r4/";
    private static final String TYPES_PACKAGE = OUTPUT_PACKAGE + ".types";
    private static final String TYPES_PATH = OUTPUT_PATH + "types/";
    private static final String TEST_PATH = "../medplum-core/src/test/java/com/medplum/fhir/r4/types/";
    private static final List<String> RESERVED = Arrays.asList("abstract", "assert", "boolean", "break", "byte", "case",
            "catch", "char", "class", "const", "continue", "default", "do", "double", "else", "enum", "extends",
            "final", "finally", "float", "for", "goto", "if", "implements", "import", "instanceof", "int", "interface",
            "long", "native", "new", "package", "private", "protected", "public", "return", "short", "size", "static",
            "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
            "volatile", "while");

    public static void mkdirs() {
        new File(TYPES_PATH).mkdirs();
        new File(TEST_PATH).mkdirs();
    }

    public static void writePropertyNames(final List<FhirType> allTypes) throws IOException {
        final Set<String> nameSet = new HashSet<>();

        for (final FhirType fhirType : allTypes) {
            for (final Property property : fhirType.getProperties()) {
                nameSet.add(property.getName());
            }
        }

        final List<String> sortedNames = new ArrayList<>(nameSet);
        Collections.sort(sortedNames);

        final FileBuilder b = new FileBuilder(INDENT);
        b.append("package " + OUTPUT_PACKAGE + ";");
        b.newLine();

        b.append("public class FhirPropertyNames {");
        b.increaseIndent();

        for (final String name : sortedNames) {
            b.append("public static final String " + getConstantName(name) + " = \"" + name + "\";");
        }

        b.decreaseIndent();
        b.append("}");
        Files.writeString(Path.of(OUTPUT_PATH + "FhirPropertyNames.java"), b.toString());
    }

    public static void writeMainFile(final FhirType fhirType) throws IOException {
        final FileBuilder b = new FileBuilder(INDENT);
        b.append("package " + TYPES_PACKAGE + ";");
        b.newLine();

        if (fhirType.isResource() && fhirType.getSubTypes().isEmpty()) {
            b.append("import jakarta.json.JsonObject;");
        } else {
            b.append("import jakarta.json.Json;");
            b.append("import jakarta.json.JsonObject;");
            b.append("import jakarta.json.JsonObjectBuilder;");
        }

        b.newLine();
        b.append("import com.medplum.fhir.r4.FhirPropertyNames;");

        if (fhirType.getOutputName().equals("OperationOutcome")) {
            b.append("import com.medplum.fhir.r4.StandardOutcomes;");
        }

        writeClass(b, fhirType, true);
        Files.writeString(Path.of(TYPES_PATH + fhirType.getOutputName() + ".java"), b.toString());
    }

    private static void writeClass(final FileBuilder b, final FhirType fhirType, final boolean topLevel) {
        final String resourceType = fhirType.getOutputName();

        b.newLine();

        JavadocGenerator.generateJavadoc(b, fhirType.getTypeDef().getString("description"));

        if (topLevel && fhirType.isDomainResource()) {
            b.append("public class " + resourceType + " extends DomainResource {");
        } else if (topLevel && fhirType.isResource()) {
            b.append("public class " + resourceType + " extends FhirResource {");
        } else if (topLevel) {
            b.append("public class " + resourceType + " extends FhirObject {");
        } else {
            b.append("public static class " + resourceType + " extends FhirObject {");
        }

        b.increaseIndent();

        b.append("public static final String RESOURCE_TYPE = \"" + resourceType + "\";");

        b.newLine();
        b.append("public static Builder create() {");
        b.append("    return new Builder();");
        b.append("}");
        b.newLine();
        b.append("public static Builder create(final JsonObject data) {");
        b.append("    return new Builder(data);");
        b.append("}");
        b.newLine();
        b.append("public " + resourceType + "(final JsonObject data) {");
        b.append("    super(data);");
        b.append("}");

        if (resourceType.equals("OperationOutcome")) {
            b.newLine();
            b.append("public boolean isOk() {");
            b.append("    final String id = id();");
            b.append("    return id.equals(StandardOutcomes.ALL_OK_ID) || id.equals(StandardOutcomes.CREATED_ID);");
            b.append("}");
        }

        for (final Property property : fhirType.getProperties()) {
            final String propertyName = getOutputName(property.getName());

            if (fhirType.getParentType() == null && fhirType.isResource() && Generator.BASE_RESOURCE_PROPERTIES.contains(propertyName)) {
                // Ignore properties inherited from FhirResource
                continue;
            }

            if (fhirType.getParentType() == null && fhirType.isDomainResource() && Generator.DOMAIN_RESOURCE_PROPERTIES.contains(propertyName)) {
                // Ignore properties inherited from DomainResource
                continue;
            }

            final String constantName = "FhirPropertyNames." + getConstantName(property.getName());
            final String javaType = getJavaType(property);

            b.newLine();
            JavadocGenerator.generateJavadoc(b, property.getDescription());

            if (javaType.equals("FhirResource")) {
                b.append("public FhirResource " + propertyName + "() {");
                b.append("    return getObject(FhirResource.class, " + constantName + ");");
                b.append("}");
                b.newLine();
                b.append("public <T extends FhirResource> T " + propertyName + "(final Class<T> c) {");
                b.append("    return getObject(c, " + constantName + ");");
                b.append("}");
            } else {
                b.append("public " + javaType + " " + propertyName + "() {");
                b.increaseIndent();

                switch (javaType) {
                case "String":
                    b.append("return getString(" + constantName + ");");
                    break;

                case "Boolean":
                    b.append("return data.getBoolean(" + constantName + ");");
                    break;

                case "Integer":
                    b.append("return data.getInt(" + constantName + ");");
                    break;

                case "Double":
                    b.append("return data.getJsonNumber(" + constantName + ").doubleValue();");
                    break;

                case "java.net.URI":
                    b.append("return getUri(" + constantName + ");");
                    break;

                case "java.time.Instant":
                    b.append("return getInstant(" + constantName + ");");
                    break;

                case "java.time.LocalDate":
                    b.append("return getLocalDate(" + constantName + ");");
                    break;

                default:
                    if (javaType.startsWith("java.util.List<")) {
                        final String className = javaType.substring("java.util.List<".length(), javaType.length() - 1);
                        b.append("return getList(" + className + ".class, " + constantName + ");");
                    } else {
                        b.append("return getObject(" + javaType + ".class, " + constantName + ");");
                    }
                }

                b.decreaseIndent();
                b.append("}");
            }
        }

        b.newLine();

        if (fhirType.isResource()) {
            if (fhirType.isDomainResource()) {
                b.append("public static final class Builder extends DomainResource.Builder<" + resourceType + ", " + resourceType + ".Builder> {");
            } else {
                b.append("public static final class Builder extends FhirResource.Builder<" + resourceType + ", " + resourceType + ".Builder> {");
            }
            b.newLine();
            b.append("    private Builder() {");
            b.append("        super(RESOURCE_TYPE);");
            b.append("    }");
            b.newLine();
            b.append("    private Builder(final JsonObject data) {");
            b.append("        super(RESOURCE_TYPE, data);");
            b.append("    }");
        } else {
            b.append("public static final class Builder {");
            b.append("    private final JsonObjectBuilder b;");
            b.newLine();
            b.append("    private Builder() {");
            b.append("        b = Json.createObjectBuilder();");
            b.append("    }");
            b.newLine();
            b.append("    private Builder(final JsonObject data) {");
            b.append("        b = Json.createObjectBuilder(data);");
            b.append("    }");
        }

        for (final Property property : fhirType.getProperties()) {
            final String propertyName = getOutputName(property.getName());

            if (fhirType.getParentType() == null && fhirType.isResource() && Generator.BASE_RESOURCE_PROPERTIES.contains(propertyName)) {
                // Ignore properties inherited from FhirResource
                continue;
            }

            if (fhirType.getParentType() == null && fhirType.isDomainResource() && Generator.DOMAIN_RESOURCE_PROPERTIES.contains(propertyName)) {
                // Ignore properties inherited from DomainResource
                continue;
            }

            final String constantName = "FhirPropertyNames." + getConstantName(property.getName());
            String javaType = getJavaType(property);

            if (javaType.equals("FhirResource")) {
                // Be a bit more permissive in the builder
                javaType = "JsonObject";
            }

            b.newLine();
            b.append("    public Builder " + propertyName + "(final " + javaType + " " + propertyName + ") {");
            if (javaType.equals("java.net.URI") ||
                    javaType.equals("java.time.Instant") ||
                    javaType.equals("java.time.LocalDate")) {
                b.append("        b.add(" + constantName + ", " + propertyName + ".toString());");
            } else if (javaType.equals("java.util.List<String>")) {
                b.append("        b.add(" + constantName + ", FhirObject.toStringArray(" + propertyName + "));");
            } else if (javaType.equals("java.util.List<Integer>")) {
                b.append("        b.add(" + constantName + ", FhirObject.toIntegerArray(" + propertyName + "));");
            } else if (javaType.equals("java.util.List<Double>")) {
                b.append("        b.add(" + constantName + ", FhirObject.toDoubleArray(" + propertyName + "));");
            } else if (javaType.equals("java.util.List<java.net.URI>")) {
                b.append("        b.add(" + constantName + ", FhirObject.toUriArray(" + propertyName + "));");
            } else if (javaType.equals("java.util.List<java.time.Instant>")) {
                b.append("        b.add(" + constantName + ", FhirObject.toInstantArray(" + propertyName + "));");
            } else if (javaType.equals("java.util.List<JsonObject>")) {
                b.append("        b.add(" + constantName + ", FhirObject.toJsonObjectArray(" + propertyName + "));");
            } else if (javaType.startsWith("java.util.List<")) {
                b.append("        b.add(" + constantName + ", FhirObject.toArray(" + propertyName + "));");
            } else {
                b.append("        b.add(" + constantName + ", " + propertyName + ");");
            }
            b.append("        return this;");
            b.append("    }");
        }

        b.newLine();
        b.append("    public " + resourceType + " build() {");
        b.append("        return new " + resourceType + "(b.build());");
        b.append("    }");

        if (fhirType.isResource() || fhirType.isDomainResource()) {
            b.newLine();
            b.append("    protected Builder getBuilder() {");
            b.append("        return this;");
            b.append("    }");
        }

        b.append("}");

        Collections.sort(fhirType.getSubTypes(), (o1, o2) -> o1.getOutputName().compareTo(o2.getOutputName()));

        for (final FhirType subType : fhirType.getSubTypes()) {
            b.newLine();
            writeClass(b, subType, false);
        }

        b.decreaseIndent();
        b.append("}");
    }

    public static void writeTestFile(final FhirType fhirType) throws IOException {
        final String qualifiedType = fhirType.getQualifiedName();

        final FileBuilder b = new FileBuilder(INDENT);
        b.append("package " + TYPES_PACKAGE + ";");
        b.newLine();
        b.append("import static org.junit.jupiter.api.Assertions.*;");
        b.newLine();
        b.append("import jakarta.json.Json;");
        b.newLine();
        b.append("import org.junit.Test;");
        b.newLine();
        b.append("public class " + fhirType.getOutputName() + "Test {");
        b.newLine();
        b.increaseIndent();

        b.append("@Test");
        b.append("public void testConstructor() {");
        b.append("    assertNotNull(new " + qualifiedType + "(Json.createObjectBuilder().build()));");
        b.append("}");
        b.newLine();
        b.append("@Test");
        b.append("public void testBuilderFromJsonObject() {");
        b.append("    assertNotNull(" + qualifiedType + ".create(Json.createObjectBuilder().build()).build());");
        b.append("}");

        for (final Property property : fhirType.getProperties()) {
            final String propertyName = getOutputName(property.getName());

            if (propertyName.equals("resourceType")) {
                continue;
            }

            final String javaType = getJavaType(property);
            final String testName = "test" + WordUtils.capitalize(propertyName);

            b.newLine();

            if (javaType.equals("FhirResource")) {
                b.append("@Test");
                b.append("public void " + testName + "() {");
                b.append("    final Patient p = Patient.create().build();");
                b.append("    assertEquals(p, " + qualifiedType + ".create()." + propertyName + "(p).build()." + propertyName + "());");
                b.append("}");
                b.newLine();
                b.append("@Test");
                b.append("public void " + testName + "AsClass() {");
                b.append("    final Patient p = Patient.create().build();");
                b.append("    assertEquals(p, " + qualifiedType + ".create()." + propertyName + "(p).build()." + propertyName + "(Patient.class));");
                b.append("}");
            } else {
                String valueDecl = null;
                String valueStr = null;

                switch (javaType) {
                case "String":
                    valueStr = "\"x\"";
                    break;

                case "Boolean":
                    valueStr = "true";
                    break;

                case "Integer":
                    valueStr = "1";
                    break;

                case "Double":
                    valueStr = "1.0";
                    break;

                case "java.net.URI":
                    valueDecl = "final java.net.URI value = java.net.URI.create(\"https://www.example.com\");";
                    valueStr = "value";
                    break;

                case "java.time.Instant":
                    valueDecl = "final java.time.Instant value = java.time.Instant.now();";
                    valueStr = "value";
                    break;

                case "java.time.LocalDate":
                    valueDecl = "final java.time.LocalDate value = java.time.LocalDate.now();";
                    valueStr = "value";
                    break;

                default:
                    if (javaType.startsWith("java.util.List<")) {
                        final String className = javaType.substring("java.util.List<".length(), javaType.length() - 1);
                        final FhirType elementType = Generator.FHIR_TYPES.get(className);
                        if (elementType == null) {
                            valueDecl = "final " + javaType + " value = java.util.Collections.emptyList();";
                        } else {
                            valueDecl = "final java.util.List<" + elementType.getQualifiedName() + "> value = java.util.Collections.emptyList();";
                        }
                    } else {
                        final FhirType elementType = Generator.FHIR_TYPES.get(javaType);
                        valueDecl = "final " + elementType.getQualifiedName() + " value = " + elementType.getQualifiedName() + ".create().build();";
                    }
                    valueStr = "value";
                }

                b.append("@Test");
                b.append("public void " + testName + "() {");

                if (valueDecl != null) {
                    b.append("    " + valueDecl);
                }

                b.append("    assertEquals(" +
                        valueStr + ", " +
                        qualifiedType + ".create()." + propertyName + "(" + valueStr + ").build()." + propertyName + "());");
                b.append("}");
            }
        }

        b.decreaseIndent();
        b.append("}");

        Files.writeString(Path.of(TEST_PATH + fhirType.getOutputName() + "Test.java"), b.toString());
    }

    private static String getJavaType(final Property property) {
        final String constValue = property.getDefinition().getString("const", null);
        if (constValue != null) {
            return "String";
        }

        if (property.getResourceType().equals("OperationOutcome") && property.getName().equals("resource")) {
            return "FhirResource";
        }

        if (property.getResourceType().equals("Extension") && (property.getName().equals("valueUri") || property.getName().equals("valueUrl"))) {
            return "java.net.URI";
        }

        final String typeValue = property.getDefinition().getString("type", null);
        if (typeValue != null) {
            if (typeValue.equals("array")) {
                final JsonObject itemDefinition = property.getDefinition().getJsonObject("items");
                if (itemDefinition != null && itemDefinition.containsKey("$ref")) {
                    return "java.util.List<" + getJavaTypeFromDefinition(itemDefinition.getString("$ref")) + ">";
                } else if (itemDefinition != null && itemDefinition.containsKey("enum")) {
                    return "java.util.List<String>";
                } else {
                    return "JsonArray";
                }

            } else {
                return getJavaTypeFromDefinition(typeValue);
            }
        }

        final JsonValue enumValue = property.getDefinition().get("enum");
        if (enumValue != null) {
            return "String";
        }

        final String ref = property.getDefinition().getString("$ref", null);
        if (ref != null) {
            return getJavaTypeFromDefinition(ref);
        }

        System.out.println("unhandled property definition:");
        System.out.println(property.getDefinition().toString());
        return "JsonValue";
    }

    private static String getJavaTypeFromDefinition(String ref) {
        if (ref.startsWith("#/definitions/")) {
            ref = ref.replace("#/definitions/", "");
        }

        switch (ref) {
        case "boolean":
            return "Boolean";

        case "base64Binary":
        case "canonical":
        case "code":
        case "id":
        case "markdown":
        case "string":
        case "xhtml":
            return "String";

        case "uri":
        case "url":
            return "java.net.URI";

        case "date":
            return "java.time.LocalDate";

        case "dateTime":
        case "instant":
        case "time":
            return "java.time.Instant";

        case "decimal":
            return "Double";

        case "integer":
        case "positiveInt":
        case "unsignedInt":
        case "number":
            return "Integer";

        case "ResourceList":
            return "FhirResource";
        }

        return ref.replaceAll("_", "");
    }

    private static String getOutputName(final String inputName) {
        String result = inputName;
        if (result.contains("_")) {
            result = CaseUtils.toCamelCase(result, false, '_');
        }
        if (RESERVED.contains(result)) {
            result = result + "Value";
        }
        return result;
    }

    private static String getConstantName(final String inputName) {
        final StringBuilder b = new StringBuilder();
        b.append("PROPERTY_");

        for (int i = 0; i < inputName.length(); i++) {
            final char c = inputName.charAt(i);
            if (Character.isUpperCase(c)) {
                b.append('_');
                b.append(c);
            } else {
                b.append(Character.toUpperCase(c));
            }
        }

        return b.toString();
    }
}
