package com.medplum.generator;

import java.util.ArrayList;
import java.util.List;

import jakarta.json.JsonObject;

public class FhirType {
    private final JsonObject typeDef;
    private final String inputName;
    private final String parentType;
    private final String outputName;
    private final List<Property> properties;
    private final List<FhirType> subTypes;
    private boolean resource;

    public FhirType(
            final JsonObject typeDef,
            final String inputName,
            final String parentType,
            final String outputName) {

        this.typeDef = typeDef;
        this.inputName = inputName;
        this.parentType = parentType;
        this.outputName = outputName;
        properties = new ArrayList<>();
        subTypes = new ArrayList<>();
    }

    public JsonObject getTypeDef() {
        return typeDef;
    }

    public String getInputName() {
        return inputName;
    }

    public String getParentType() {
        return parentType;
    }

    public String getOutputName() {
        return outputName;
    }

    public String getQualifiedName() {
        return parentType == null ? outputName : parentType + "." + outputName;
    }

    public List<Property> getProperties() {
        return properties;
    }

    public List<FhirType> getSubTypes() {
        return subTypes;
    }

    public boolean isResource() {
        return resource;
    }

    public void setResource(final boolean resource) {
        this.resource = resource;
    }
}
