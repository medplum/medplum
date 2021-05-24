package com.medplum.fhir.r4;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.json.Json;
import jakarta.json.JsonObject;

import org.junit.Test;

public class FhirSchemaTest {

    @Test
    public void testNullResourceType() {
        final var outcome = FhirSchema.validate((String) null);
        assertFalse(outcome.isOk());
        assertEquals(StandardOutcomes.CODE_INVALID, outcome.issue().get(0).code());
    }

    @Test
    public void testNullResource() {
        final var outcome = FhirSchema.validate((JsonObject) null);
        assertFalse(outcome.isOk());
        assertEquals(StandardOutcomes.CODE_INVALID, outcome.issue().get(0).code());
    }

    @Test
    public void testMissingResourceType() {
        final var resource = Json.createObjectBuilder().build();
        final var outcome = FhirSchema.validate(resource);
        assertFalse(outcome.isOk());
        assertEquals(StandardOutcomes.CODE_INVALID, outcome.issue().get(0).code());
    }

    @Test
    public void testBlankResourceType() {
        final var resource = Json.createObjectBuilder().add("resourceType", "").build();
        final var outcome = FhirSchema.validate(resource);
        assertFalse(outcome.isOk());
        assertEquals(StandardOutcomes.CODE_INVALID, outcome.issue().get(0).code());
    }

    @Test
    public void testUnknownResourceType() {
        final var resource = Json.createObjectBuilder().add("resourceType", "foo").build();
        final var outcome = FhirSchema.validate(resource);
        assertFalse(outcome.isOk());
        assertEquals(StandardOutcomes.CODE_INVALID, outcome.issue().get(0).code());
    }

    @Test
    public void testPatientResourceType() {
        final var resource = Json.createObjectBuilder().add("resourceType", "Patient").build();
        final var outcome = FhirSchema.validate(resource);
        assertTrue(outcome.isOk());
    }

    @Test
    public void testAdditionalProperties() {
        final var resource = Json.createObjectBuilder().add("resourceType", "Patient").add("foo", "bar").build();
        final var outcome = FhirSchema.validate(resource);
        assertFalse(outcome.isOk());
        assertEquals("Invalid additional property 'foo'", outcome.issue().get(0).details().text());
    }

    @Test
    public void testRequiredProperties() {
        final var resource = Json.createObjectBuilder().add("resourceType", "AdverseEvent").build();
        final var outcome = FhirSchema.validate(resource);
        assertFalse(outcome.isOk());
        assertEquals("Missing required property 'subject'", outcome.issue().get(0).details().text());
    }

    @Test
    public void testWrongPropertyType() {
        final var resource = Json.createObjectBuilder().add("resourceType", "Patient").add("name", "Alice").build();
        final var outcome = FhirSchema.validate(resource);
        assertFalse(outcome.isOk());
        assertEquals("Expected array for property 'name'", outcome.issue().get(0).details().text());
    }
}
