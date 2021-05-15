package com.medplum.server.fhir.r4;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;

import jakarta.json.Json;
import jakarta.json.JsonArray;
import jakarta.json.JsonObject;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;

import org.junit.Test;

import com.medplum.fhir.r4.FhirMediaType;
import com.medplum.fhir.r4.types.Patient;
import com.medplum.server.BaseTest;

public class DefaultEndpointTest extends BaseTest {

    @Test
    public void testMetadata() {
        final Response response = fhir().readMetadata();
        assertEquals(200, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testCreate() {
        final Response response = fhir().create(Patient.create().build());
        assertEquals(201, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertNotNull(response.getHeaderString(HttpHeaders.LOCATION));
        assertNotNull(response.getHeaderString(HttpHeaders.ETAG));
    }

    @Test
    public void testCreateMissingProperty() {
        final Response response = fhir().post(UriBuilder.fromUri(fhir().getBaseUri()).path("Patient").build(), Json.createObjectBuilder().build());
        assertEquals(400, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testReadNotFound() {
        final Response response = fhir().read("Patient", "does-not-exist");
        assertEquals(404, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testReadHistoryNotFound() {
        final Response response = fhir().readHistory("Patient", "does-not-exist");
        assertEquals(404, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testReadVersionNotFound() {
        final Response response = fhir().readVersion("Patient", "does-not-exist", "version-does-not-exist");
        assertEquals(404, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testRead() {
        final Response response1 = fhir().create(Patient.create().build());
        assertEquals(201, response1.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response1.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertNotNull(response1.getHeaderString(HttpHeaders.LOCATION));

        final String[] path = URI.create(response1.getHeaderString(HttpHeaders.LOCATION)).getPath().split("/");
        assertEquals(7, path.length);
        assertEquals("fhir", path[1]);
        assertEquals("R4", path[2]);
        assertEquals("Patient", path[3]);
        assertEquals("_history", path[5]);

        final String id = path[4];

        final Response response2 = fhir().read("Patient", id);
        assertEquals(200, response2.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response2.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testReadUnauthorized() {
        final Response response1 = fhir().create(Patient.create().build());
        assertEquals(201, response1.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response1.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertNotNull(response1.getHeaderString(HttpHeaders.LOCATION));

        final String[] path = URI.create(response1.getHeaderString(HttpHeaders.LOCATION)).getPath().split("/");
        assertEquals(7, path.length);
        assertEquals("fhir", path[1]);
        assertEquals("R4", path[2]);
        assertEquals("Patient", path[3]);
        assertEquals("_history", path[5]);

        final String id = path[4];

        // Now try to get the resource without authorization
        final Response response2 = target("/fhir/R4/Patient/" + id)
                .request()
                .get();
        assertEquals(401, response2.getStatus());
    }

    @Test
    public void testReadHistory() {
        final Response response1 = fhir().create(Patient.create().build());
        assertEquals(201, response1.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response1.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertNotNull(response1.getHeaderString(HttpHeaders.LOCATION));

        final String[] path = URI.create(response1.getHeaderString(HttpHeaders.LOCATION)).getPath().split("/");
        assertEquals(7, path.length);
        assertEquals("fhir", path[1]);
        assertEquals("R4", path[2]);
        assertEquals("Patient", path[3]);
        assertEquals("_history", path[5]);

        final String id = path[4];

        final Response response2 = fhir().readHistory("Patient", id);
        assertEquals(200, response2.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response2.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testVersion() {
        final Response response1 = fhir().create(Patient.create().build());
        assertEquals(201, response1.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response1.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertNotNull(response1.getHeaderString(HttpHeaders.LOCATION));

        final String[] path = URI.create(response1.getHeaderString(HttpHeaders.LOCATION)).getPath().split("/");
        assertEquals(7, path.length);
        assertEquals("fhir", path[1]);
        assertEquals("R4", path[2]);
        assertEquals("Patient", path[3]);
        assertEquals("_history", path[5]);

        final String id = path[4];
        final String vid = path[6];

        final Response response2 = fhir().readVersion("Patient", id, vid);
        assertEquals(200, response2.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response2.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testSearch() {
        // Create 3 patients
        for (int i = 0; i < 3; i++) {
            fhir().create(Patient.create().build());
        }

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
        String id = null;

        // Create 3 patients
        for (int i = 0; i < 3; i++) {
            final Response response = fhir().create(Patient.create().build());
            if (i == 0) {
                final String[] path = URI.create(response.getHeaderString(HttpHeaders.LOCATION)).getPath().split("/");
                id = path[4];
            }
        }

        // Search by ID, should only return exactly one result
        final Response response = fhir().search("Patient", "_id=" + id);
        assertEquals(200, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));

        final JsonObject json = response.readEntity(JsonObject.class);
        assertEquals("searchset", json.getString("type"));

        final JsonArray entries = json.getJsonArray("entry");
        assertEquals(1, entries.size());
    }
}