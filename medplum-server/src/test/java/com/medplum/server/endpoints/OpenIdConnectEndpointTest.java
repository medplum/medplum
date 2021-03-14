package com.medplum.server.endpoints;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.json.JsonObject;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.server.BaseTest;

public class OpenIdConnectEndpointTest extends BaseTest {

    @Test
    public void testSmartConfiguration() {
        final Response response = target("/.well-known/openid-configuration").request().get();
        assertEquals(200, response.getStatus());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));

        final JsonObject config = response.readEntity(JsonObject.class);
        assertNotNull(config);
        assertTrue(config.containsKey("issuer"));
        assertTrue(config.containsKey("authorization_endpoint"));
        assertTrue(config.containsKey("token_endpoint"));
    }
}
