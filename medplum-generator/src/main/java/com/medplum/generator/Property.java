package com.medplum.generator;

import jakarta.json.JsonObject;

public class Property {
    private final String resourceType;
    private final String name;
    private final JsonObject definition;

    public Property(final String resourceType, final String name, final JsonObject definition) {
        this.resourceType = resourceType;
        this.name = name;
        this.definition = definition;
    }

    public String getResourceType() {
        return resourceType;
    }

    public String getName() {
        return name;
    }

    public JsonObject getDefinition() {
        return definition;
    }

    public String getDescription() {
        return definition.getString("description");
    }
}
