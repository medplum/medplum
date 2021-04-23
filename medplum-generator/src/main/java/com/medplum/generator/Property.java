package com.medplum.generator;

import java.util.Arrays;
import java.util.List;

import jakarta.json.JsonObject;

import org.apache.commons.text.CaseUtils;

public class Property {
    private static final List<String> RESERVED = Arrays.asList("abstract", "assert", "boolean", "break", "byte", "case",
            "catch", "char", "class", "const", "continue", "default", "do", "double", "else", "enum", "extends",
            "final", "finally", "float", "for", "goto", "if", "implements", "import", "instanceof", "int", "interface",
            "long", "native", "new", "package", "private", "protected", "public", "return", "short", "size", "static",
            "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
            "volatile", "while");

    private JsonObject typeDef;
    private String inputName;
    private String javaType;
    private String description;

    public JsonObject getTypeDef() {
        return typeDef;
    }

    public void setTypeDef(final JsonObject typeDef) {
        this.typeDef = typeDef;
    }

    public String getInputName() {
        return inputName;
    }

    public void setInputName(final String inputName) {
        this.inputName = inputName;
    }

    public String getJavaType() {
        return javaType;
    }

    public void setJavaType(final String javaType) {
        this.javaType = javaType;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(final String description) {
        this.description = description;
    }

    public String getOutputName() {
        String result = inputName;
        if (result.contains("_")) {
            result = CaseUtils.toCamelCase(result, false, '_');
        }
        if (RESERVED.contains(result)) {
            result = result + "Value";
        }
        return result;
    }

    public String getConstantName() {
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
