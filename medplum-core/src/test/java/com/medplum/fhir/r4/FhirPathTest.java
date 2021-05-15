package com.medplum.fhir.r4;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.json.Json;
import jakarta.json.JsonArray;
import jakarta.json.JsonObject;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;

import org.junit.Test;

public class FhirPathTest {

    @Test
    public void testGetProperty() {
        final JsonObject obj = Json.createObjectBuilder().add("x", "y").build();
        final FhirPath path = new FhirPath("x");
        assertEquals("y", ((JsonString) path.evalFirst(obj)).getString());
    }

    @Test
    public void testGetNestedProperty() {
        final JsonObject obj = Json.createObjectBuilder()
                .add("x", Json.createObjectBuilder()
                        .add("y", "z")
                        .build())
                .build();
        final FhirPath path = new FhirPath("x.y");
        assertEquals("z", ((JsonString) path.evalFirst(obj)).getString());
    }

    @Test
    public void testGetArrayElement() {
        final JsonArray array = Json.createArrayBuilder().add("a").add("b").add("c").build();
        final FhirPath path = new FhirPath("1");
        assertEquals("b", ((JsonString) path.evalFirst(array)).getString());
    }

    @Test
    public void testGetPropertyFromNumber() {
        final JsonValue value = Json.createValue(1);
        final FhirPath path = new FhirPath("x");
        assertTrue(path.eval(value).isEmpty());
    }

    @Test
    public void testResourceType() {
        final JsonObject obj = Json.createObjectBuilder()
                .add("resourceType", "Patient")
                .add("name", Json.createArrayBuilder()
                        .add(Json.createObjectBuilder()
                                .add("given", "Homer")
                                .add("family", "Simpson")
                                .build())
                        .build())
                .build();

        assertEquals(Json.createValue("Homer"), new FhirPath("name.given").evalFirst(obj));
        assertEquals(Json.createValue("Simpson"), new FhirPath("name.family").evalFirst(obj));

        assertEquals(Json.createValue("Homer"), new FhirPath("Patient.name.given").evalFirst(obj));
        assertEquals(Json.createValue("Simpson"), new FhirPath("Patient.name.family").evalFirst(obj));
    }

    @Test
    public void testCompoundPath() {
        final JsonObject obj = Json.createObjectBuilder()
                .add("resourceType", "Patient")
                .add("name", Json.createArrayBuilder()
                        .add(Json.createObjectBuilder()
                                .add("given", "Homer")
                                .add("family", "Simpson")
                                .build())
                        .build())
                .add("birthDate", "1982-06-05")
                .build();

        assertEquals(Json.createValue("1982-06-05"), new FhirPath("birthDate").evalFirst(obj));
        assertEquals(Json.createValue("1982-06-05"), new FhirPath("Patient.birthDate").evalFirst(obj));
        assertEquals(Json.createValue("1982-06-05"), new FhirPath("Person.birthDate | Patient.birthDate").evalFirst(obj));
    }
}
