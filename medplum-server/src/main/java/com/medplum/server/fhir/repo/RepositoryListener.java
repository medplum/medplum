package com.medplum.server.fhir.repo;

import com.medplum.fhir.types.FhirResource;

public interface RepositoryListener {

    void onCreate(FhirResource resource);

    void onUpdate(FhirResource resource);

    void onDelete(FhirResource resource);
}
