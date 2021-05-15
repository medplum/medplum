package com.medplum.server.oauth2;

import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
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
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;
import jakarta.ws.rs.core.UriBuilder;

import org.glassfish.jersey.server.mvc.Viewable;

import com.medplum.fhir.r4.types.Login;
import com.medplum.server.security.OAuthService;

@Path("/oauth2/scopes")
@Produces(MediaType.TEXT_HTML)
@PermitAll
public class ScopesEndpoint {

    @Inject
    private OAuthService oauth;

    @QueryParam("redirect_uri")
    private String redirectUri;

    @QueryParam("code")
    private String code;

    @QueryParam("state")
    private String state;

    @QueryParam("scope")
    private String scope;

    @GET
    public Viewable showScopes() {
        final Map<String, Object> model = new HashMap<>();
        model.put("scopes", scope.split(" "));
        return new Viewable("/scopes.mustache", model);
    }

    @POST
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    public Response submit(final MultivaluedMap<String, String> form) {
        final Login login = oauth.validateCode(code);
        if (login == null) {
            throw new BadRequestException("Invalid code");
        }

        // Build a list of original scopes requested by the client application
        final List<String> scopesList = new ArrayList<>(Arrays.asList(scope.split(" ")));

        // Filter the list to only the scopes submitted by the user
        scopesList.retainAll(form.keySet());

        // Update the login resource with the submitted scopes
        oauth.setScopes(login, String.join(" ", scopesList));

        return Response.status(Status.FOUND)
                .location(UriBuilder.fromUri(URI.create(redirectUri))
                        .queryParam("code", code)
                        .queryParam("state", state)
                        .build())
                .build();
    }
}
