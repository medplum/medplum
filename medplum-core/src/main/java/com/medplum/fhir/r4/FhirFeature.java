package com.medplum.fhir.r4;

import jakarta.ws.rs.core.Feature;
import jakarta.ws.rs.core.FeatureContext;

public class FhirFeature implements Feature {

    @Override
    public boolean configure(final FeatureContext context) {
        context.register(FhirReader.class);
        context.register(FhirWriter.class);
        return true;
    }
}
