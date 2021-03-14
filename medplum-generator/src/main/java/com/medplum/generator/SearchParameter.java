package com.medplum.generator;

import jakarta.json.JsonObject;

public class SearchParameter {
    private String resourceType;
    private String code;
    private String expression;
    private JsonObject definition;

    public String getResourceType() {
        return resourceType;
    }

    public void setResourceType(final String resourceType) {
        this.resourceType = resourceType;
    }

    public String getCode() {
        return code;
    }

    public void setCode(final String code) {
        this.code = code;
    }

    public String getExpression() {
        return expression;
    }

    public void setExpression(final String expression) {
        this.expression = expression;
    }

    public JsonObject getDefinition() {
        return definition;
    }

    public void setDefinition(final JsonObject definition) {
        this.definition = definition;
    }
}
