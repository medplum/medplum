package com.medplum.server.fhir;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;

import jakarta.json.Json;
import jakarta.json.JsonArray;
import jakarta.json.JsonObject;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.server.BaseTest;

public class R4EndpointTest extends BaseTest {

    @Test
    public void testMetadata() {
        final Response response = fhir().get("/metadata");
        assertEquals(200, response.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testCreate() {
        final Response response = fhir().post("/Patient", Json.createObjectBuilder().add("resourceType", "Patient").build());
        assertEquals(201, response.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertNotNull(response.getHeaderString(HttpHeaders.LOCATION));
        assertNotNull(response.getHeaderString(HttpHeaders.ETAG));
    }

    @Test
    public void testCreateMissingProperty() {
        final Response response = fhir().post("/Patient", Json.createObjectBuilder().build());
        assertEquals(400, response.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testReadNotFound() {
        final Response response = fhir().get("/Patient/does-not-exist");
        assertEquals(404, response.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testReadHistoryNotFound() {
        final Response response = fhir().get("/Patient/does-not-exist/_history");
        assertEquals(404, response.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testReadVersionNotFound() {
        final Response response = fhir().get("/Patient/does-not-exist/_history/version-does-not-exist");
        assertEquals(404, response.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testRead() {
        final Response response1 = fhir().post("/Patient", Json.createObjectBuilder().add("resourceType", "Patient").build());
        assertEquals(201, response1.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response1.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertNotNull(response1.getHeaderString(HttpHeaders.LOCATION));

        final String[] path = URI.create(response1.getHeaderString(HttpHeaders.LOCATION)).getPath().split("/");
        assertEquals(7, path.length);
        assertEquals("fhir", path[1]);
        assertEquals("R4", path[2]);
        assertEquals("Patient", path[3]);
        assertEquals("_history", path[5]);

        final String id = path[4];

        final Response response2 = fhir().get("/Patient/" + id);
        assertEquals(200, response2.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response2.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testReadUnauthorized() {
        final Response response1 = fhir().post("/Patient", Json.createObjectBuilder().add("resourceType", "Patient").build());
        assertEquals(201, response1.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response1.getHeaderString(HttpHeaders.CONTENT_TYPE));
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
        final Response response1 = fhir().post("/Patient", Json.createObjectBuilder().add("resourceType", "Patient").build());
        assertEquals(201, response1.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response1.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertNotNull(response1.getHeaderString(HttpHeaders.LOCATION));

        final String[] path = URI.create(response1.getHeaderString(HttpHeaders.LOCATION)).getPath().split("/");
        assertEquals(7, path.length);
        assertEquals("fhir", path[1]);
        assertEquals("R4", path[2]);
        assertEquals("Patient", path[3]);
        assertEquals("_history", path[5]);

        final String id = path[4];

        final Response response2 = fhir().get("/Patient/" + id + "/_history");
        assertEquals(200, response2.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response2.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testVersion() {
        final Response response1 = fhir().post("/Patient", Json.createObjectBuilder().add("resourceType", "Patient").build());
        assertEquals(201, response1.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response1.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertNotNull(response1.getHeaderString(HttpHeaders.LOCATION));

        final String[] path = URI.create(response1.getHeaderString(HttpHeaders.LOCATION)).getPath().split("/");
        assertEquals(7, path.length);
        assertEquals("fhir", path[1]);
        assertEquals("R4", path[2]);
        assertEquals("Patient", path[3]);
        assertEquals("_history", path[5]);

        final String id = path[4];
        final String vid = path[6];

        final Response response2 = fhir().get("/Patient/" + id + "/_history/" + vid);
        assertEquals(200, response2.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response2.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testSearch() {
        // Create 3 patients
        for (int i = 0; i < 3; i++) {
            fhir().post("/Patient", Json.createObjectBuilder().add("resourceType", "Patient").build());
        }

        // Ensure search returns at least 3 patients
        final Response response = fhir().get("/Patient");
        assertEquals(200, response.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response.getHeaderString(HttpHeaders.CONTENT_TYPE));

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
            final Response response = fhir().post("/Patient", Json.createObjectBuilder().add("resourceType", "Patient").build());
            if (i == 0) {
                final String[] path = URI.create(response.getHeaderString(HttpHeaders.LOCATION)).getPath().split("/");
                id = path[4];
            }
        }

        // Search by ID, should only return exactly one result
        final Response response = fhir().get("/Patient?_id=" + id);
        assertEquals(200, response.getStatus());
        assertEquals(Fhir.FHIR_JSON_CONTENT_TYPE, response.getHeaderString(HttpHeaders.CONTENT_TYPE));

        final JsonObject json = response.readEntity(JsonObject.class);
        assertEquals("searchset", json.getString("type"));

        final JsonArray entries = json.getJsonArray("entry");
        assertEquals(1, entries.size());
    }
}