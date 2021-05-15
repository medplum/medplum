package com.medplum.server.fhir.r4;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.fhir.r4.FhirMediaType;
import com.medplum.server.BaseTest;

public class BinaryTest extends BaseTest {

    @Test
    public void testCreateBinary() {
        final Response response = fhir().createBinary(Entity.entity("Hello world", MediaType.TEXT_PLAIN_TYPE));
        assertEquals(201, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertNotNull(response.getHeaderString(HttpHeaders.LOCATION));
        assertNotNull(response.getHeaderString(HttpHeaders.ETAG));
    }
}
