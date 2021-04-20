package com.medplum.server.fhir.graphql;

import java.util.Map;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;

import com.medplum.server.fhir.repo.Repository;
import com.medplum.server.security.SecurityUser;

import graphql.ExecutionInput;
import graphql.ExecutionResult;
import graphql.GraphQL;
import graphql.schema.GraphQLSchema;

@Path("/fhir/R4/$graphql")
@Produces(MediaType.APPLICATION_JSON)
@PermitAll
public class FhirGraphQLEndpoint {

    @Inject
    private Repository repo;

    @GET
    public Response get(@QueryParam("query") final String query) {
        return execute(query);
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    public Response post(final Map<String, Object> body) {
        return execute((String) body.get("query"));
    }

    private Response execute(final String query) {
        if (query == null || query.isBlank()) {
            throw new BadRequestException("Missing query");
        }

        final GraphQLSchema schema = FhirGraphQLSchema.getRootSchema();
        final GraphQL graphQL = GraphQL.newGraphQL(schema).build();

        final ExecutionResult result = graphQL.execute(ExecutionInput.newExecutionInput()
                .query(query)
                .context(new FhirGraphQLContext(repo, SecurityUser.SYSTEM_USER))
                .build());

        return Response.status(result.getErrors().isEmpty() ? Status.OK : Status.BAD_REQUEST)
                .type(MediaType.APPLICATION_JSON_TYPE)
                .entity(result)
                .build();
    }
}
