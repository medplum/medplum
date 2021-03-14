package com.medplum.server;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.ws.rs.core.Response;

import org.junit.Test;

public class CorsFilterTest extends BaseTest {

    @Test
    public void testNonCorsOptions() {
        final Response response = target("/").request().options();
        assertEquals(200, response.getStatus());
        assertNull(response.getHeaderString("Access-Control-Allow-Origin"));
        assertNull(response.getHeaderString("Access-Control-Allow-Credentials"));
        assertNull(response.getHeaderString("Access-Control-Allow-Methods"));
        assertNull(response.getHeaderString("Access-Control-Allow-Headers"));
    }

    @Test
    public void testNonCorsGet() {
        final Response response = target("/").request().get();
        assertEquals(200, response.getStatus());
        assertNull(response.getHeaderString("Access-Control-Allow-Origin"));
        assertNull(response.getHeaderString("Access-Control-Allow-Credentials"));
        assertNull(response.getHeaderString("Access-Control-Allow-Methods"));
        assertNull(response.getHeaderString("Access-Control-Allow-Headers"));
    }

    @Test
    public void testCorsOptions() {
        final Response response = target("/").request().header("Origin", "http://example.com").options();
        assertEquals(200, response.getStatus());
        assertEquals("http://example.com", response.getHeaderString("Access-Control-Allow-Origin"));
        assertNotNull(response.getHeaderString("Access-Control-Allow-Credentials"));
        assertNotNull(response.getHeaderString("Access-Control-Allow-Methods"));
        assertNotNull(response.getHeaderString("Access-Control-Allow-Headers"));
    }

    @Test
    public void testCorsGet() {
        final Response response = target("/").request().header("Origin", "http://example.com").get();
        assertEquals(200, response.getStatus());
        assertEquals("http://example.com", response.getHeaderString("Access-Control-Allow-Origin"));
        assertNotNull(response.getHeaderString("Access-Control-Allow-Credentials"));
        assertNotNull(response.getHeaderString("Access-Control-Allow-Methods"));
        assertNotNull(response.getHeaderString("Access-Control-Allow-Headers"));
    }
}
