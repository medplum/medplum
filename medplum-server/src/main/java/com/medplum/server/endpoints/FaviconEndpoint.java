package com.medplum.server.endpoints;

import java.io.IOException;
import java.io.InputStream;

import jakarta.annotation.security.PermitAll;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

@Path("/favicon.ico")
@PermitAll
public class FaviconEndpoint {
    private static byte[] favicon;

    @GET
    public Response getFavicon() throws IOException {
        return Response.ok(getFaviconBytes(), "image/x-icon").build();
    }

    private static byte[] getFaviconBytes() throws IOException {
        if (favicon == null) {
            try (final InputStream in = FaviconEndpoint.class.getClassLoader().getResourceAsStream("favicon.ico")) {
                favicon = in.readAllBytes();
            }
        }
        return favicon;
    }
}
