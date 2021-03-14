package com.medplum.server.endpoints;

import java.time.Instant;

import jakarta.annotation.security.PermitAll;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/healthcheck")
@Produces(MediaType.APPLICATION_JSON)
@PermitAll
public class HealthCheckEndpoint {

    @GET
    public JsonObject getHealthCheck() {
        return Json.createObjectBuilder()
                .add("status", "up")
                .add("time", Instant.now().toString())
                .build();
    }
}
