package com.medplum.generator;

import java.util.Arrays;
import java.util.List;

import jakarta.json.JsonObject;

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
        if (RESERVED.contains(inputName)) {
            return inputName + "_";
        }
        return inputName;
    }

    public String getConstantName() {
        return "PROPERTY_" + inputName.toUpperCase();
    }
}