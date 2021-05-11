package com.medplum.server.sse;

import com.medplum.fhir.types.FhirResource;

/**
 * A SseTransport provides message networking.
 *
 * The LocalSseTransport implementation uses an in-memory store for local development.
 *
 * The KinesisSseTransport implementation uses AWS Kinesis for clustered networking in production.
 */
public interface SseTransport {

    void setService(SseService service);

    void handleUp(FhirResource resource);
}
