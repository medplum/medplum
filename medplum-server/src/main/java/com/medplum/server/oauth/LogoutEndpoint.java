package com.medplum.server.oauth;

import java.net.URI;

import jakarta.annotation.security.PermitAll;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Configuration;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;

import com.medplum.server.ConfigSettings;

@Path("/oauth2/logout")
@PermitAll
public class LogoutEndpoint {

    @Context
    private Configuration config;

    @GET
    public Response logout() {
        return Response.status(Status.FOUND)
                .location(URI.create((String) config.getProperty(ConfigSettings.BASE_URL)))
                .build();
    }
}
