package com.medplum.server.oauth;

import java.net.URI;

import jakarta.annotation.security.PermitAll;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;

@Path("/oauth2/logout")
@PermitAll
public class LogoutEndpoint {

    @GET
    public Response logout() {
        return Response.status(Status.FOUND)
                .location(URI.create("http://localhost:3000/"))
                .build();
    }
}
