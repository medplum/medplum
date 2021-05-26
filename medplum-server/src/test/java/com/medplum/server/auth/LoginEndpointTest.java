package com.medplum.server.auth;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.ws.rs.client.Entity;

import org.junit.Test;

import com.medplum.fhir.r4.FhirMediaType;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.server.BaseTest;

public class LoginEndpointTest extends BaseTest {

    @Test
    public void testPatientSuccess() {
        final var r = target("/auth/login").request().post(createLogin(testClientApp.id(), "admin@example.com", "admin", "openid", "patient"));
        assertNotNull(r);
        assertEquals(200, r.getStatus());

        final var result = r.readEntity(JsonObject.class);
        assertTrue(result.containsKey("accessToken"));
    }

    @Test
    public void testUserDoesNotHaveRole() {
        final var r = target("/auth/login").request().post(createLogin(testClientApp.id(), "admin@example.com", "admin", "openid", "practitioner"));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("User does not have role: practitioner", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testMissingClient() {
        final var r = target("/auth/login").request().post(createLogin(null, "admin@example.com", "admin", "openid", "patient"));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Missing clientId", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testBlankClient() {
        final var r = target("/auth/login").request().post(createLogin("", "admin@example.com", "admin", "openid", "patient"));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Missing clientId", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testInvalidClient() {
        final var r = target("/auth/login").request().post(createLogin("123", "admin@example.com", "admin", "openid", "patient"));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Invalid clientId", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testMissingEmail() {
        final var r = target("/auth/login").request().post(createLogin(testClientApp.id(), null, "admin", "openid", "patient"));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Missing email", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testBlankEmail() {
        final var r = target("/auth/login").request().post(createLogin(testClientApp.id(), "", "admin", "openid", "patient"));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Missing email", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testMissingPassword() {
        final var r = target("/auth/login").request().post(createLogin(testClientApp.id(), "admin@example.com", null, "openid", "patient"));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Missing password", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testBlankPassword() {
        final var r = target("/auth/login").request().post(createLogin(testClientApp.id(), "admin@example.com", "", "openid", "patient"));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Missing password", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testWrongPassword() {
        final var r = target("/auth/login").request().post(createLogin(testClientApp.id(), "admin@example.com", "wrong", "openid", "patient"));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Bad password", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testMissingScope() {
        final var r = target("/auth/login").request().post(createLogin(testClientApp.id(), "admin@example.com", "admin", null, "patient"));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Missing scope", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testBlankScope() {
        final var r = target("/auth/login").request().post(createLogin(testClientApp.id(), "admin@example.com", "admin", "", "patient"));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Missing scope", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testMissingRole() {
        final var r = target("/auth/login").request().post(createLogin(testClientApp.id(), "admin@example.com", "admin", "openid", null));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Missing role", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testBlankRole() {
        final var r = target("/auth/login").request().post(createLogin(testClientApp.id(), "admin@example.com", "admin", "openid", ""));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Missing role", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    @Test
    public void testUnrecognizedRole() {
        final var r = target("/auth/login").request().post(createLogin(testClientApp.id(), "admin@example.com", "admin", "openid", "abc"));
        assertNotNull(r);
        assertEquals(400, r.getStatus());
        assertEquals("Unrecognized role: abc", new OperationOutcome(r.readEntity(JsonObject.class)).issue().get(0).details().text());
    }

    private static Entity<JsonObject> createLogin(
            final String clientId,
            final String email,
            final String password,
            final String scope,
            final String role) {

        final var b = Json.createObjectBuilder();

        if (clientId != null) {
            b.add("clientId", clientId);
        }

        if (email != null) {
            b.add("email", email);
        }

        if (password != null) {
            b.add("password", password);
        }

        if (scope != null) {
            b.add("scope", scope);
        }

        if (role != null) {
            b.add("role", role);
        }

        return Entity.entity(b.build(), FhirMediaType.APPLICATION_FHIR_JSON_TYPE);
    }
}
