package com.medplum.server.fhir.r4;

import static java.util.Collections.*;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;

import jakarta.json.JsonArray;
import jakarta.json.JsonObject;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

import org.junit.Before;
import org.junit.Test;

import com.medplum.fhir.r4.FhirMediaType;
import com.medplum.fhir.r4.types.Bundle;
import com.medplum.fhir.r4.types.Identifier;
import com.medplum.fhir.r4.types.Patient;
import com.medplum.server.BaseTest;

public class SearchTest extends BaseTest  {

    @Before
    @Override
    public void setUp() throws Exception {
        super.setUp();

        // Create 3 patients
        for (int i = 0; i < 3; i++) {
            fhir().create(Patient.create().build());
        }
    }

    @Test
    public void testSearch() {
        // Ensure search returns at least 3 patients
        final Response response = fhir().search("Patient", "");
        assertEquals(200, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));

        final JsonObject json = response.readEntity(JsonObject.class);
        assertEquals("searchset", json.getString("type"));

        final JsonArray entries = json.getJsonArray("entry");
        assertTrue(entries.size() >= 3);
    }

    @Test
    public void testSearchById() {
        final Response r1 = fhir().create(Patient.create().build());
        final String[] path = URI.create(r1.getHeaderString(HttpHeaders.LOCATION)).getPath().split("/");
        final String id = path[4];

        final Response response = fhir().search("Patient", "_id=" + id);
        assertEquals(200, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));

        final Bundle bundle = response.readEntity(Bundle.class);
        assertEquals("searchset", bundle.type());
        assertEquals(1, bundle.entry().size());
        assertEquals(id, bundle.entry().get(0).resource(Patient.class).id());
    }

    @Test
    public void testSearchByIdentifier() {
        final String identifierValue = "123456";

        final Patient patientRequest = Patient.create()
                .identifier(singletonList(Identifier.create()
                        .system(URI.create("https://www.example.com"))
                        .value(identifierValue)
                        .build()))
                .build();

        final Patient patient = fhir().create(patientRequest)
                .readEntity(Patient.class);

        final Response response = fhir().search("Patient", "identifier=" + identifierValue);
        assertEquals(200, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));

        final Bundle bundle = response.readEntity(Bundle.class);
        assertEquals("searchset", bundle.type());
        assertEquals(1, bundle.entry().size());
        assertEquals(patient.id(), bundle.entry().get(0).resource(Patient.class).id());
    }
}
