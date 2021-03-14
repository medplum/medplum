package com.medplum.server.endpoints;

import jakarta.annotation.security.PermitAll;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

@Path("/")
@PermitAll
public class RootEndpoint {

    @GET
    public Response getRoot() {
        return Response.ok().build();
    }
}
