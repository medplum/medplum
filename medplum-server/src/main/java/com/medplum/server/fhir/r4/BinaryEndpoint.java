package com.medplum.server.fhir.r4;

import static com.medplum.fhir.FhirMediaType.*;

import java.io.IOException;
import java.io.InputStream;

import jakarta.inject.Inject;
import jakarta.json.JsonPatch;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;

import com.medplum.fhir.FhirMediaType;
import com.medplum.fhir.StandardOutcomes;
import com.medplum.fhir.types.Binary;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.server.fhir.r4.repo.BinaryStorage;
import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.security.SecurityUser;

@Path("/fhir/R4/Binary")
@Produces(FhirMediaType.APPLICATION_FHIR_JSON)
public class BinaryEndpoint {

    @Inject
    private Repository repo;

    @Inject
    private BinaryStorage binaryStorage;

    @Context
    private SecurityContext securityContext;

    @HeaderParam(HttpHeaders.CONTENT_TYPE)
    private MediaType contentType;

    @PathParam("id")
    private String id;

    @PathParam("vid")
    private String vid;

    @POST
    public OperationOutcome create(final InputStream inputStream) throws IOException {
        final OperationOutcome outcome = repo.create(
                getUser(),
                Binary.create().contentType(contentType.toString()).build());
        binaryStorage.writeBinary(outcome.resource(Binary.class), inputStream);
        return outcome;
    }

    @GET
    @Path("/{id}")
    public Response read() throws IOException {
        final OperationOutcome outcome = repo.read(getUser(), Binary.RESOURCE_TYPE, id);
        if (!outcome.isOk()) {
            return Response.status(outcome.status())
                    .type(APPLICATION_FHIR_JSON)
                    .entity(outcome)
                    .build();
        }
        final Binary binary = outcome.resource(Binary.class);
        final InputStream inputStream = binaryStorage.readBinary(binary);
        return Response.ok()
                .type(binary.contentType())
                .entity(inputStream)
                .build();
    }

    @GET
    @Path("/{id}/_history/{vid}")
    public Response readVersion() throws IOException {
        final OperationOutcome outcome = repo.readVersion(getUser(), Binary.RESOURCE_TYPE, id, vid);
        if (!outcome.isOk()) {
            return Response.status(outcome.status())
                    .type(APPLICATION_FHIR_JSON)
                    .entity(outcome)
                    .build();
        }
        final Binary binary = outcome.resource(Binary.class);
        final InputStream inputStream = binaryStorage.readBinary(binary);
        return Response.ok()
                .type(binary.contentType())
                .entity(inputStream)
                .build();
    }

    @PUT
    @Path("/{id}")
    public OperationOutcome update(final InputStream inputStream) throws IOException {
        final OperationOutcome outcome = repo.update(
                getUser(),
                id,
                Binary.create().contentType(contentType.toString()).build());
        binaryStorage.writeBinary(outcome.resource(Binary.class), inputStream);
        return outcome;
    }

    @PATCH
    @Path("/{id}")
    public OperationOutcome patch(final JsonPatch patch) {
        return StandardOutcomes.notFound();
    }

    @GET
    public OperationOutcome search() {
        return StandardOutcomes.notFound();
    }

    private SecurityUser getUser() {
        return (SecurityUser) securityContext.getUserPrincipal();
    }
}
