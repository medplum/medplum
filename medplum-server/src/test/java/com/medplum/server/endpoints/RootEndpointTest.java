package com.medplum.server.endpoints;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.server.BaseTest;

public class RootEndpointTest extends BaseTest {

    @Test
    public void testGetRoot() {
        final Response response = target("/").request().get();
        assertEquals(200, response.getStatus());
    }
}
