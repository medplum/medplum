package com.medplum.server.sse;

import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;

public class SseConnection {
    private final SseEventSink eventSink;
    private final Sse sse;

    public SseConnection(final SseEventSink eventSink, final Sse sse) {
        this.eventSink = eventSink;
        this.sse = sse;
    }

    public SseEventSink getEventSink() {
        return eventSink;
    }

    public Sse getSse() {
        return sse;
    }
}
