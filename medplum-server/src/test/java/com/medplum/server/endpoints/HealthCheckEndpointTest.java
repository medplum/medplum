package com.medplum.server.endpoints;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.server.BaseTest;

public class HealthCheckEndpointTest extends BaseTest {

    @Test
    public void testGetHealthCheck() {
        final Response response = target("/healthcheck").request().get();
        assertEquals(200, response.getStatus());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaderString(HttpHeaders.CONTENT_TYPE));
        assertTrue(response.readEntity(String.class).contains("\"status\":\"up\""));
    }
}
