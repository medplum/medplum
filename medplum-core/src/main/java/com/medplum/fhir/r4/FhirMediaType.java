package com.medplum.fhir.r4;

import jakarta.ws.rs.core.MediaType;

public class FhirMediaType {

    /**
     * A {@code String} constant representing {@value #APPLICATION_FHIR_JSON} media type.
     */
    public static final String APPLICATION_FHIR_JSON = "application/fhir+json";

    /**
     * A {@link MediaType} constant representing {@value #APPLICATION_FHIR_JSON} media type.
     */
    public static final MediaType APPLICATION_FHIR_JSON_TYPE = new MediaType("application", "fhir+json");

    FhirMediaType() {
        throw new UnsupportedOperationException();
    }

    /**
     * Returns true if the media type is compatible with FHIR JSON.
     * Checks the type (for "application") and subtype (for "fhir+json").
     * Ignores extra parameters.
     * @param mediaType The media type.
     * @return True if compatible with FHIR JSON.
     */
    public static boolean isCompatible(final MediaType mediaType) {
        return mediaType != null &&
                mediaType.getType().equals("application") &&
                mediaType.getSubtype().equals("fhir+json");
    }
}
