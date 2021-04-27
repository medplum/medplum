package com.medplum.server.oauth;

import java.net.URI;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Configuration;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;
import jakarta.ws.rs.core.UriBuilder;

import com.medplum.server.ConfigSettings;
import com.medplum.server.security.OAuthService;

@Path("/oauth2/authorize")
@PermitAll
public class AuthorizeEndpoint {

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

    @QueryParam("code_challenge_method")
    private String codeChallengeMethod;

    @QueryParam("code_challenge")
    private String codeChallenge;

    @GET
    public Response authorize() {
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

        final String loginUrl = config.getProperty(ConfigSettings.BASE_URL) + "/oauth2/login";

        return Response
                .status(Status.FOUND)
                .type(MediaType.APPLICATION_JSON)
                .location(UriBuilder.fromUri(URI.create(loginUrl))
                        .queryParam("response_type", responseType)
                        .queryParam("client_id", clientId)
                        .queryParam("redirect_uri", redirectUri)
                        .queryParam("state", state)
                        .queryParam("scope", scope)
                        .build())
                .build();
    }
}
