package com.medplum.server.sse;

import com.medplum.fhir.r4.types.FhirResource;

public class LocalSseTransport implements SseTransport {
    private SseService service;

    @Override
    public void setService(final SseService service) {
        this.service = service;
    }

    @Override
    public void handleUp(final FhirResource resource) {
        service.handleDown(resource);
    }
}
