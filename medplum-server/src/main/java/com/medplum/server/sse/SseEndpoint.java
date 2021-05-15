package com.medplum.server.sse;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;

import com.medplum.fhir.r4.StandardOutcomes;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.fhir.r4.types.Subscription;
import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.security.SecurityUser;

import graphql.com.google.common.base.Objects;

@Path("sse")
@PermitAll
public class SseEndpoint {

    @Inject
    private SseService sseService;

    @Inject
    private Repository repo;

    @GET
    @Produces(MediaType.SERVER_SENT_EVENTS)
    public void getServerSentEvents(
            @Context final SseEventSink eventSink,
            @Context final Sse sse,
            @QueryParam("subscription") final String subscriptionId) {

        final OperationOutcome outcome = repo.read(SecurityUser.SYSTEM_USER, Subscription.RESOURCE_TYPE, subscriptionId);
        if (!outcome.isOk()) {
            sendError(eventSink, sse, outcome);
            return;
        }

        final Subscription subscription = outcome.resource(Subscription.class);
        if (!Objects.equal(subscription.status(), "active")) {
            sendError(eventSink, sse, "Subscription is not active");
            return;
        }

        if (subscription.channel() == null || !Objects.equal(subscription.channel().type(), "sse")) {
            sendError(eventSink, sse, "Subscription channel is not sse");
            return;
        }

        if (subscription.criteria() == null || subscription.criteria().isBlank()) {
            sendError(eventSink, sse, "Subscription criteria is missing");
            return;
        }

        sseService.add(new SseConnection(eventSink, sse, subscription));
    }

    private void sendError(final SseEventSink eventSink, final Sse sse, final String message) {
        sendError(eventSink, sse, StandardOutcomes.invalid(message));
    }

    private void sendError(final SseEventSink eventSink, final Sse sse, final OperationOutcome outcome) {
        eventSink.send(sse.newEvent(outcome.toString()));
    }
}
