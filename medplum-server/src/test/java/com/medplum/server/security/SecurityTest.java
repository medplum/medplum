package com.medplum.server.security;

import static jakarta.ws.rs.core.HttpHeaders.*;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.server.BaseTest;

public class SecurityTest extends BaseTest {

    @Test
    public void testUnauthenticated() {
        final Response response = this.target("/").request().get();
        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    public void testBlankAuthorization() {
        final Response response = this.target("/oauth2/userinfo").request().header(AUTHORIZATION, "").get();
        assertNotNull(response);
        assertEquals(401, response.getStatus());
    }

    @Test
    public void testBlankToken() {
        final Response response = this.target("/oauth2/userinfo").request().header(AUTHORIZATION, "Bearer ").get();
        assertNotNull(response);
        assertEquals(401, response.getStatus());
    }

    @Test
    public void testInvalidToken() {
        final Response response = this.target("/oauth2/userinfo").request().header(AUTHORIZATION, "Bearer x").get();
        assertNotNull(response);
        assertEquals(401, response.getStatus());
    }
}
