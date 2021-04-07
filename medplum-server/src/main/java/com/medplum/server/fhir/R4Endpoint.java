package com.medplum.server.fhir;

import jakarta.inject.Inject;
import jakarta.json.JsonObject;
import jakarta.json.JsonPatch;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;

import com.medplum.fhir.FhirMediaType;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.server.fhir.repo.Repository;
import com.medplum.server.search.SearchRequestParser;
import com.medplum.server.security.SecurityUser;

@Path("/fhir/R4")
@Produces(FhirMediaType.APPLICATION_FHIR_JSON)
public class R4Endpoint {

    @Inject
    private Repository repo;

    @Context
    private SecurityContext securityContext;

    @Context
    private UriInfo uriInfo;

    @PathParam("resourceType")
    private String resourceType;

    @PathParam("id")
    private String id;

    @PathParam("vid")
    private String vid;

    @POST
    @Consumes(FhirMediaType.APPLICATION_FHIR_JSON)
    public OperationOutcome createBatch(final JsonObject data) {
        return repo.createBatch(getUser(), data);
    }

    @POST
    @Path("/{resourceType}")
    @Consumes(FhirMediaType.APPLICATION_FHIR_JSON)
    public OperationOutcome create(final JsonObject data) {
        return repo.create(getUser(), resourceType, data);
    }

    @GET
    @Path("/{resourceType}")
    public OperationOutcome search() {
        return repo.search(getUser(), SearchRequestParser.parse(resourceType, uriInfo.getQueryParameters()));
    }

    @GET
    @Path("/{resourceType}/{id}")
    public OperationOutcome read() {
        return repo.read(getUser(), resourceType, id);
    }

    @GET
    @Path("/{resourceType}/{id}/_history")
    public OperationOutcome readHistory() {
        return repo.readHistory(getUser(), resourceType, id);
    }

    @GET
    @Path("/{resourceType}/{id}/_history/{vid}")
    public OperationOutcome readVersion() {
        return repo.readVersion(getUser(), resourceType, id, vid);
    }

    @PUT
    @Path("/{resourceType}/{id}")
    @Consumes(FhirMediaType.APPLICATION_FHIR_JSON)
    public OperationOutcome update(final JsonObject data) {
        return repo.update(getUser(), resourceType, id, data);
    }

    @PATCH
    @Path("/{resourceType}/{id}")
    @Consumes(FhirMediaType.APPLICATION_FHIR_JSON)
    public OperationOutcome patch(final JsonPatch patch) {
        return repo.patch(getUser(), resourceType, id, patch);
    }

    @DELETE
    @Path("/{resourceType}/{id}")
    public OperationOutcome delete() {
        return repo.delete(getUser(), resourceType, id);
    }

    private SecurityUser getUser() {
        return (SecurityUser) securityContext.getUserPrincipal();
    }
}
