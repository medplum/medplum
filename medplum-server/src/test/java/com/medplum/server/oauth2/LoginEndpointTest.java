package com.medplum.server.oauth2;

import static org.junit.jupiter.api.Assertions.*;

import static com.medplum.fhir.IdUtils.*;

import java.net.URI;

import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.core.Form;
import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.server.BaseTest;

public class LoginEndpointTest extends BaseTest {

    @Test
    public void testLoginSuccess() {
        final String state = generateId();

        final Response r1 = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", testClientApp.id())
                .queryParam("redirect_uri", "https://www.example.com/redirect")
                .queryParam("state", state)
                .queryParam("scope", "openid offline_access")
                .request()
                .get();
        assertEquals(302, r1.getStatus());

        final URI loginLocation = r1.getLocation();
        assertNotNull(loginLocation);
        assertTrue(loginLocation.toString().contains("/oauth2/login"));

        final Response r2 = client().target(loginLocation)
                .request()
                .post(Entity.form(new Form()
                        .param("email", "admin@example.com")
                        .param("password", "admin")));
        assertEquals(302, r2.getStatus());
    }

    @Test
    public void testLoginWrongPassword() {
        final String state = generateId();

        final Response r1 = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", testClientApp.id())
                .queryParam("redirect_uri", "https://www.example.com/redirect")
                .queryParam("state", state)
                .queryParam("scope", "openid offline_access")
                .request()
                .get();
        assertEquals(302, r1.getStatus());

        final URI loginLocation = r1.getLocation();
        assertNotNull(loginLocation);
        assertTrue(loginLocation.toString().contains("/oauth2/login"));

        final Response r2 = client().target(loginLocation)
                .request()
                .post(Entity.form(new Form()
                        .param("email", "admin@example.com")
                        .param("password", "wrong-password")));
        assertEquals(400, r2.getStatus());
    }

    @Test
    public void testLoginWrongEmail() {
        final String state = generateId();

        final Response r1 = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", testClientApp.id())
                .queryParam("redirect_uri", "https://www.example.com/redirect")
                .queryParam("state", state)
                .queryParam("scope", "openid offline_access")
                .request()
                .get();
        assertEquals(302, r1.getStatus());

        final URI loginLocation = r1.getLocation();
        assertNotNull(loginLocation);
        assertTrue(loginLocation.toString().contains("/oauth2/login"));

        final Response r2 = client().target(loginLocation)
                .request()
                .post(Entity.form(new Form()
                        .param("email", "does-not-exist@example.com")
                        .param("password", "admin")));
        assertEquals(400, r2.getStatus());
    }
}
