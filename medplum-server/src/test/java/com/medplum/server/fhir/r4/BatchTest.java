package com.medplum.server.fhir.r4;

import static org.junit.jupiter.api.Assertions.*;

import static com.medplum.util.IdUtils.*;

import java.net.URI;
import java.util.Collections;

import jakarta.json.Json;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.fhir.r4.FhirMediaType;
import com.medplum.fhir.r4.types.Bundle;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.fhir.r4.types.Bundle.BundleEntry;
import com.medplum.server.BaseTest;

public class BatchTest extends BaseTest {

    @Test
    public void testCreateBatchMissingType() {
        final Response response = fhir().createBatch(Bundle.create().build());
        assertEquals(400, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertTrue(response.readEntity(String.class).contains("Missing bundle type"));
    }

    @Test
    public void testCreateBatchInvalidType() {
        final Response response = fhir().createBatch(Bundle.create().type("foo").build());
        assertEquals(400, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertTrue(response.readEntity(String.class).contains("Unrecognized bundle type 'foo'"));
    }

    @Test
    public void testCreateBatchMissingEntry() {
        final Response response = fhir().createBatch(Bundle.create().type("batch").build());
        assertEquals(400, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));

        final OperationOutcome outcome = response.readEntity(OperationOutcome.class);
        assertNotNull(outcome);
        assertEquals("Missing bundle entry", outcome.issue().get(0).details().text());
    }

    @Test
    public void testCreateBatchInvalidEntry() {
        final Response response = fhir().createBatch(Bundle.create(Json.createObjectBuilder().add("type", "batch").add("entry", 123).build()).build());
        assertEquals(400, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));

        final OperationOutcome outcome = response.readEntity(OperationOutcome.class);
        assertNotNull(outcome);
        assertEquals("Missing bundle entry", outcome.issue().get(0).details().text());
    }

    @Test
    public void testCreateEmptyBatch() {
        final Response response = fhir().createBatch(Bundle.create().type("batch").entry(Collections.emptyList()).build());
        assertEquals(200, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testCreateEmptyTransaction() {
        final Response response = fhir().createBatch(Bundle.create().type("transaction").entry(Collections.emptyList()).build());
        assertEquals(200, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testCreateBatch() {
        final Response response = fhir().createBatch(Bundle.create()
                .type("batch")
                .entry(Collections.singletonList(BundleEntry.create()
                        .resource(Json.createObjectBuilder().add("resourceType", "Patient").build())
                        .build()))
                .build());
        assertEquals(200, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testCreateTransaction() {
        final Response response = fhir().createBatch(Bundle.create()
                .type("transaction")
                .entry(Collections.singletonList(BundleEntry.create()
                        .resource(Json.createObjectBuilder().add("resourceType", "Patient").build())
                        .build()))
                .build());
        assertEquals(200, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }

    @Test
    public void testCreateTransactionWithReferences() {
        final String id = generateId();
        final URI fullUrl = URI.create("urn:uuid:" + id);
        final Response response = fhir().createBatch(Bundle.create()
                .type("transaction")
                .entry(Collections.singletonList(BundleEntry.create()
                        .fullUrl(fullUrl)
                        .resource(Json.createObjectBuilder()
                                .add("resourceType", "Patient")
                                .add("id", id)
                                .build())
                        .build()))
                .build());
        assertEquals(200, response.getStatus());
        assertEquals(FhirMediaType.APPLICATION_FHIR_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
    }
}
