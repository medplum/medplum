package com.medplum.server.sse;

import java.util.Objects;

import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;

import com.medplum.fhir.types.Subscription;
import com.medplum.server.fhir.r4.search.SearchRequest;
import com.medplum.server.fhir.r4.search.SearchRequestParser;

public class SseConnection {
    private final SseEventSink eventSink;
    private final Sse sse;
    private final Subscription subscription;
    private final SearchRequest criteria;

    public SseConnection(
            final SseEventSink eventSink,
            final Sse sse,
            final Subscription subscription) {

        this.eventSink = Objects.requireNonNull(eventSink);
        this.sse = Objects.requireNonNull(sse);
        this.subscription = Objects.requireNonNull(subscription);
        this.criteria = SearchRequestParser.parse(Objects.requireNonNull(subscription.criteria()));
    }

    public SseEventSink getEventSink() {
        return eventSink;
    }

    public Sse getSse() {
        return sse;
    }

    public Subscription getSubscription() {
        return subscription;
    }

    public SearchRequest getCriteria() {
        return criteria;
    }
}
