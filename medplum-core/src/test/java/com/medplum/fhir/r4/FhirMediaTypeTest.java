package com.medplum.fhir.r4;

import static org.junit.jupiter.api.Assertions.*;

import java.util.HashMap;
import java.util.Map;

import jakarta.ws.rs.core.MediaType;

import org.junit.Test;

public class FhirMediaTypeTest {

    @Test
    public void testContructor() {
        assertThrows(UnsupportedOperationException.class, FhirMediaType::new);
    }

    @Test
    public void testCompatible() {
        // Compatible types
        assertTrue(FhirMediaType.isCompatible(FhirMediaType.APPLICATION_FHIR_JSON_TYPE));

        // Ignore parameters
        final Map<String, String> params = new HashMap<>();
        params.put("key", "value");
        final MediaType fhirWithParams = new MediaType("application", "fhir+json", params);
        assertNotEquals(FhirMediaType.APPLICATION_FHIR_JSON_TYPE, fhirWithParams);
        assertTrue(FhirMediaType.isCompatible(fhirWithParams));

        // Incompatible types
        assertFalse(FhirMediaType.isCompatible(MediaType.APPLICATION_JSON_TYPE));
        assertFalse(FhirMediaType.isCompatible(MediaType.TEXT_PLAIN_TYPE));
    }
}
