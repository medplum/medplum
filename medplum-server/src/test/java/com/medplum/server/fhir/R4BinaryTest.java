package com.medplum.server.fhir;

import org.junit.Test;

import com.medplum.server.BaseTest;

public class R4BinaryTest extends BaseTest {

    @Test
    public void testCreateBinary() {
//        final Response response = fhir().post("/Patient", Json.createObjectBuilder().add("resourceType", "Patient").build());
//        assertEquals(201, response.getStatus());
//        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
//        assertNotNull(response.getHeaderString(HttpHeaders.LOCATION));
//        assertNotNull(response.getHeaderString(HttpHeaders.ETAG));

        fhir().target("");
    }
}