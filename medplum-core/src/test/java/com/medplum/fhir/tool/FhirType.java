package com.medplum.fhir.tool;

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

    public FhirType(final JsonObject typeDef, final String inputName, final String parentType, final String outputName) {
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

    public static class Property {
        private JsonObject typeDef;
        private String inputName;
        private String outputName;
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

        public String getOutputName() {
            return outputName;
        }

        public void setOutputName(final String outputName) {
            this.outputName = outputName;
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
    }
}
