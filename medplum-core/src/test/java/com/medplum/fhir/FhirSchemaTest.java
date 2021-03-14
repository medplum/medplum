package com.medplum.fhir;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.json.Json;
import jakarta.json.JsonObject;

import org.junit.Test;

import com.medplum.fhir.types.OperationOutcome;

public class FhirSchemaTest {

    @Test
    public void testNullResourceType() {
        final OperationOutcome outcome = FhirSchema.validate((String) null);
        assertFalse(outcome.isOk());
        assertEquals(StandardOperations.CODE_INVALID, outcome.issue().get(0).code());
    }

    @Test
    public void testNullResource() {
        final OperationOutcome outcome = FhirSchema.validate((JsonObject) null);
        assertFalse(outcome.isOk());
        assertEquals(StandardOperations.CODE_INVALID, outcome.issue().get(0).code());
    }

    @Test
    public void testMissingResourceType() {
        final JsonObject resource = Json.createObjectBuilder().build();
        final OperationOutcome outcome = FhirSchema.validate(resource);
        assertFalse(outcome.isOk());
        assertEquals(StandardOperations.CODE_INVALID, outcome.issue().get(0).code());
    }

    @Test
    public void testBlankResourceType() {
        final JsonObject resource = Json.createObjectBuilder().add("resourceType", "").build();
        final OperationOutcome outcome = FhirSchema.validate(resource);
        assertFalse(outcome.isOk());
        assertEquals(StandardOperations.CODE_INVALID, outcome.issue().get(0).code());
    }

    @Test
    public void testUnknownResourceType() {
        final JsonObject resource = Json.createObjectBuilder().add("resourceType", "foo").build();
        final OperationOutcome outcome = FhirSchema.validate(resource);
        assertFalse(outcome.isOk());
        assertEquals(StandardOperations.CODE_INVALID, outcome.issue().get(0).code());
    }

    @Test
    public void testPatientResourceType() {
        final JsonObject resource = Json.createObjectBuilder().add("resourceType", "Patient").build();
        final OperationOutcome outcome = FhirSchema.validate(resource);
        assertTrue(outcome.isOk());
    }

    @Test
    public void testAdditionalProperties() {
        final JsonObject resource = Json.createObjectBuilder().add("resourceType", "Patient").add("foo", "bar").build();
        final OperationOutcome outcome = FhirSchema.validate(resource);
        assertFalse(outcome.isOk());
        assertEquals("Invalid additional property 'foo'", outcome.issue().get(0).details().text());
    }

    @Test
    public void testRequiredProperties() {
        final JsonObject resource = Json.createObjectBuilder().add("resourceType", "AdverseEvent").build();
        final OperationOutcome outcome = FhirSchema.validate(resource);
        assertFalse(outcome.isOk());
        assertEquals("Missing required property 'subject'", outcome.issue().get(0).details().text());
    }
}
