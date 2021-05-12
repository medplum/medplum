package com.medplum.fhir;

import jakarta.ws.rs.core.MediaType;

public class FhirMediaType {
    public static final String APPLICATION_FHIR_JSON = "application/fhir+json";

    /**
     * A {@link MediaType} constant representing {@value #APPLICATION_FHIR_JSON} media type.
     */
    public static final MediaType APPLICATION_FHIR_JSON_TYPE = new MediaType("application", "fhir+json");
}
