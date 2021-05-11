package com.medplum.server.sse;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;

@Path("sse")
@PermitAll
public class SseEndpoint {

    @Inject
    private SseService sseService;

    @GET
    @Produces(MediaType.SERVER_SENT_EVENTS)
    public void getServerSentEvents(@Context final SseEventSink eventSink, @Context final Sse sse) {
        sseService.add(new SseConnection(eventSink, sse));
    }
}
