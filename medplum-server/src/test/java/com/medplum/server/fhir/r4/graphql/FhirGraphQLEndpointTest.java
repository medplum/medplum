package com.medplum.server.fhir.r4.graphql;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.json.JsonObject;
import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.fhir.types.Patient;
import com.medplum.server.BaseTest;

public class FhirGraphQLEndpointTest extends BaseTest {

    @Test
    public void testGetMissingQuery() {
        final Response response = target("/fhir/R4/$graphql").request().get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testPostMissingQuery() {
        final Response response = target("/fhir/R4/$graphql").request().get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testGetPatientById() {
        final Response response = target("/fhir/R4/$graphql")
                .queryParam("query", "{query}")
                .resolveTemplate("query", "{Patient(id:\"" + testPatient.id() + "\"){id name{given}}}")
                .request()
                .get();
        assertEquals(200, response.getStatus());

        final JsonObject result = response.readEntity(JsonObject.class);
        assertNotNull(result);

        final Patient patient = Patient.create(result.getJsonObject("data").getJsonObject("Patient")).build();
        assertEquals("Alice", patient.name().get(0).given().get(0));
    }
}
