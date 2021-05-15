package com.medplum.server.oauth2;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.server.BaseTest;

public class JwksEndpointTest extends BaseTest {

    @Test
    public void testUnauthorized() {
        final Response response = target("/.well-known/jwks.json")
                .request()
                .get();
        assertEquals(200, response.getStatus());
    }

    @Test
    public void testGet() {
        final Response response = target("/.well-known/jwks.json")
                .request()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + testAccessToken)
                .get();
        assertEquals(200, response.getStatus());
    }
}
