package com.medplum.server.oauth2;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.FormParam;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Configuration;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;
import jakarta.ws.rs.core.UriBuilder;

import org.glassfish.jersey.server.mvc.Viewable;

import com.medplum.fhir.types.ClientApplication;
import com.medplum.fhir.types.Login;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.server.ConfigSettings;
import com.medplum.server.security.OAuthService;

@Path("/oauth2/login")
@Produces(MediaType.TEXT_HTML)
@PermitAll
public class LoginEndpoint {

    @Context
    private Configuration config;

    @Inject
    private OAuthService oauth;

    @QueryParam("response_type")
    private String responseType;

    @QueryParam("client_id")
    private String clientId;

    @QueryParam("redirect_uri")
    private String redirectUri;

    @QueryParam("state")
    private String state;

    @QueryParam("scope")
    private String scope;

    @GET
    public Viewable login() {
        validate();
        return buildPage("", "");
    }

    @POST
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    public Response submit(
            @FormParam("email") final String email,
            @FormParam("password") final String password) {

        validate();

        final ClientApplication client = oauth.getClient(clientId);
        if (client == null) {
            throw new BadRequestException("Invalid client_id");
        }

        final OperationOutcome outcome = oauth.login(client, email, password);
        if (!outcome.isOk()) {
            return Response.status(Status.BAD_REQUEST)
                    .type(MediaType.TEXT_HTML)
                    .entity(buildPage("Bad login", email))
                    .build();
        }

        return success(outcome.resource(Login.class));
    }

    private void validate() {
        if (responseType == null || responseType.isBlank()) {
            throw new BadRequestException("Missing response_type");
        }

        if (!responseType.equals("code")) {
            throw new BadRequestException("Unsupported response_type");
        }

        if (clientId == null || clientId.isBlank()) {
            throw new BadRequestException("Missing client_id");
        }

        if (!oauth.validateClient(clientId)) {
            throw new BadRequestException("Invalid client_id");
        }

        if (redirectUri == null || redirectUri.isBlank()) {
            throw new BadRequestException("Missing redirect_uri");
        }

        if (state == null || state.isBlank()) {
            throw new BadRequestException("Missing state");
        }

        if (scope == null || scope.isBlank()) {
            throw new BadRequestException("Missing scope");
        }
    }

    private Viewable buildPage(final String error, final String email) {
        final Map<String, String> model = new HashMap<>();
        model.put("error", error);
        model.put("email", email);
        model.put("registerLink", getRegisterLink().toString());
        return new Viewable("/login.mustache", model);
    }

    private URI getRegisterLink() {
        return UriBuilder.fromUri(URI.create((String) config.getProperty(ConfigSettings.BASE_URL)))
                .path("oauth2/register")
                .queryParam("response_type", responseType)
                .queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirectUri)
                .queryParam("state", state)
                .queryParam("scope", scope)
                .build();
    }

    private Response success(final Login login) {
        return Response.status(Status.FOUND)
                .location(UriBuilder.fromUri(URI.create((String) config.getProperty(ConfigSettings.BASE_URL)))
                        .path("oauth2/role")
                        .queryParam("code", login.id())
                        .queryParam("redirect_uri", redirectUri)
                        .queryParam("state", state)
                        .queryParam("scope", scope)
                        .build())
                .build();
    }
}
