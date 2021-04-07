package com.medplum.server.fhir;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.json.JsonObject;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.fhir.FhirMediaType;
import com.medplum.server.BaseTest;

public class R4CapabilityStatementTest extends BaseTest {

    @Test
    public void testSmartConfiguration() {
        final Response response = target("/fhir/R4/metadata").request().get();
        assertEquals(200, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));

        final JsonObject config = response.readEntity(JsonObject.class);
        assertNotNull(config);
    }
}
