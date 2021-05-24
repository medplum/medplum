package com.medplum.server.endpoints;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;

import com.medplum.fhir.r4.FhirMediaType;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.fhir.r4.repo.SetupExecutor;

@Path("/setup")
@Produces(FhirMediaType.APPLICATION_FHIR_JSON)
@PermitAll
public class SetupEndpoint {

    @Inject
    private Repository repo;

    @POST
    public OperationOutcome setup() {
        return new SetupExecutor(repo).setup();
    }
}
