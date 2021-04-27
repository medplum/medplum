package com.medplum.server.endpoints;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;

import com.medplum.fhir.FhirMediaType;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.server.fhir.repo.Repository;
import com.medplum.server.fhir.repo.SetupExecutor;

@Path("/setup")
@Produces(FhirMediaType.APPLICATION_FHIR_JSON)
@PermitAll
public class SetupEndpoint {

    @Inject
    private Repository repo;

    @POST
    public OperationOutcome setup() {
        final SetupExecutor exec = new SetupExecutor(repo);
        return exec.setup();
    }
}
