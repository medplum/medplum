package com.medplum.server.sse;

import java.util.ArrayList;
import java.util.List;
import java.util.ListIterator;
import java.util.Objects;

import jakarta.ws.rs.sse.SseEventSink;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.FhirMediaType;
import com.medplum.fhir.types.FhirResource;
import com.medplum.server.search.SearchUtils;

/**
 * The SseService manages server-side events.
 *
 * Consider a 3-tier system
 *
 *                      Central
 *                         |
 *         +---------------+---------------+
 *         |               |               |
 *      Server1         Server2         Server3
 *         |               |               |
 *   +-----+-----+   +-----+-----+   +-----+-----+
 *   |     |     |   |     |     |   |     |     |
 *      Clients         Clients         Clients
 *
 * Messages travel "up" from a client to a server to the central processing.
 * Messages travel "down" from central to the servers to the clients.
 */
public class SseService {
    private static final Logger LOG = LoggerFactory.getLogger(SseService.class);
    private final SseTransport transport;
    private final List<SseConnection> connections;
    private final Object lockObject;

    public SseService(final SseTransport transport) {
        this.transport = Objects.requireNonNull(transport);
        this.connections = new ArrayList<>();
        this.lockObject = new Object();

        transport.setService(this);
    }

    public void add(final SseConnection listener) {
        synchronized (lockObject) {
            this.connections.add(listener);
        }
    }

    public void remove(final SseConnection listener) {
        synchronized (lockObject) {
            this.connections.remove(listener);
        }
    }

    public void handleUp(final FhirResource resource) {
        LOG.debug("handleUp: {}", resource);
        transport.handleUp(resource);
    }

    public void handleDown(final FhirResource resource) {
        LOG.debug("handleDown: {}", resource);
        synchronized (lockObject) {
            final ListIterator<SseConnection> iter = connections.listIterator();
            while (iter.hasNext()) {
                final SseConnection conn = iter.next();
                final SseEventSink eventSink = conn.getEventSink();
                if (eventSink.isClosed()) {
                    iter.remove();
                    continue;
                }

                if (!SearchUtils.matches(conn.getCriteria(), resource)) {
                    continue;
                }

                eventSink.send(conn.getSse().newEventBuilder()
                        .mediaType(FhirMediaType.APPLICATION_FHIR_JSON_TYPE)
                        .data(resource)
                        .build());
            }
        }
    }
}
