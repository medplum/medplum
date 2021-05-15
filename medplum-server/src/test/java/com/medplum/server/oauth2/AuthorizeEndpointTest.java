package com.medplum.server.oauth2;

import static org.junit.jupiter.api.Assertions.*;

import static com.medplum.fhir.IdUtils.*;

import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.server.BaseTest;

public class AuthorizeEndpointTest extends BaseTest {

    @Test
    public void testMissingResponseType() {
        final Response response = target("/oauth2/authorize")
                .request()
                .get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testBlankResponseType() {
        final Response response = target("/oauth2/authorize")
                .queryParam("response_type", "")
                .request()
                .get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testInvalideResponseType() {
        final Response response = target("/oauth2/authorize")
                .queryParam("response_type", "foo")
                .request()
                .get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testMissingClientId() {
        final Response response = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .request()
                .get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testBlankClientId() {
        final Response response = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", "")
                .request()
                .get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testInvalidClientId() {
        final Response response = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", "foo")
                .request()
                .get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testMissingRedirectUri() {
        final Response response = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", testClientApp.id())
                .request()
                .get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testBlankRedirectUri() {
        final Response response = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", testClientApp.id())
                .queryParam("redirect_uri", "")
                .request()
                .get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testMissingState() {
        final Response response = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", testClientApp.id())
                .queryParam("redirect_uri", "https://www.example.com/redirect")
                .request()
                .get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testBlankState() {
        final Response response = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", testClientApp.id())
                .queryParam("redirect_uri", "https://www.example.com/redirect")
                .queryParam("state", "")
                .request()
                .get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testMissingScope() {
        final String state = generateId();

        final Response response = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", testClientApp.id())
                .queryParam("redirect_uri", "https://www.example.com/redirect")
                .queryParam("state", state)
                .request()
                .get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testBlankScope() {
        final String state = generateId();
        final Response response = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", testClientApp.id())
                .queryParam("redirect_uri", "https://www.example.com/redirect")
                .queryParam("state", state)
                .queryParam("scope", "")
                .request()
                .get();
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testAuthorizeSuccess() {
        final String state = generateId();

        final Response r1 = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", testClientApp.id())
                .queryParam("redirect_uri", "https://www.example.com/redirect")
                .queryParam("state", state)
                .queryParam("scope", "openid")
                .request()
                .get();
        assertEquals(302, r1.getStatus());

        final String location = r1.getLocation().toString();
        assertNotNull(location);
        assertTrue(location.contains("/oauth2/login?"));
    }
}
