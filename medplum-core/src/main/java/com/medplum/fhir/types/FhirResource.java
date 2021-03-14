package com.medplum.fhir.types;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;

public class FhirResource extends FhirObject {

    public FhirResource(final JsonObject data) {
        super(data);
    }

    public String resourceType() {
        return getString("resourceType");
    }

    /**
     * The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes.
     */
    public String id() {
        return getString("id");
    }

    /**
     * The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource.
     */
    public Meta meta() {
        return getObject(Meta.class, "meta");
    }

    public Reference createReference() {
        return Reference.create()
                .reference(resourceType() + "/" + id())
                .display("[" + resourceType() + "]")
                .build();
    }

    public static abstract class Builder {
        protected final JsonObjectBuilder b;

        protected Builder(final String resourceType) {
            b = Json.createObjectBuilder();
            b.add("resourceType", resourceType);
        }

        protected Builder(final String resourceType, final JsonObject data) {
            b = Json.createObjectBuilder(data);
            b.add("resourceType", resourceType);
        }
    }
}
