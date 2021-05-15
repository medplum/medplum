package com.medplum.server.oauth2;

import java.net.URI;
import java.util.Objects;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonObjectBuilder;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.FormParam;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Configuration;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;

import org.jose4j.lang.JoseException;

import com.medplum.fhir.types.ClientApplication;
import com.medplum.fhir.types.FhirResource;
import com.medplum.fhir.types.Login;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.fhir.types.Patient;
import com.medplum.fhir.types.RefreshToken;
import com.medplum.server.ConfigSettings;
import com.medplum.server.Utils;
import com.medplum.server.Utils.KeyValue;
import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.security.JwtResult;
import com.medplum.server.security.OAuthService;
import com.medplum.server.security.SecurityUser;
import com.medplum.server.security.SmartScopeParser;
import com.medplum.server.security.SmartScopeSet;

@Path("/oauth2/token")
@Consumes(MediaType.APPLICATION_FORM_URLENCODED)
@Produces(MediaType.APPLICATION_JSON)
@PermitAll
public class TokenEndpoint {

    @Context
    private Configuration config;

    @Inject
    private Repository repo;

    @Inject
    private OAuthService oauth;

    @HeaderParam(HttpHeaders.AUTHORIZATION)
    private String authorization;

    @FormParam("grant_type")
    private String grantType;

    @FormParam("client_id")
    private String clientId;

    @FormParam("client_secret")
    private String clientSecret;

    @FormParam("redirect_uri")
    private String redirectUri;

    @FormParam("state")
    private String state;

    @FormParam("scope")
    private String scope;

    @FormParam("refresh_token")
    private String refreshToken;

    @FormParam("code")
    private String code;

    @FormParam("code_verifier")
    private String codeVerifier;

    @FormParam("launch")
    private String launch;

    @POST
    public Response token() throws JoseException {
        if (grantType == null || grantType.isBlank()) {
            throw new BadRequestException("Missing grant_type");
        }

        switch (grantType) {
        case "authorization_code":
            return handleAuthorizationCode();

        case "client_credentials":
            return handleClientCredentials();

        case "refresh_token":
            return handleRefreshToken();

        default:
            throw new BadRequestException("Unsupported grant_type");
        }
    }

    private Response handleAuthorizationCode() throws JoseException {
        if (code == null || code.isBlank()) {
            throw new BadRequestException("Missing code");
        }

        final Login login = oauth.validateCode(code);
        if (login == null) {
            throw new BadRequestException("Invalid code");
        }

        if (login.scope() == null) {
            throw new BadRequestException("Login missing scope");
        }

        final OperationOutcome profileOutcome = oauth.getLoginProfile(login);
        if (!profileOutcome.isOk()) {
            throw new BadRequestException(profileOutcome.issue().get(0).details().text());
        }

        final FhirResource profile = profileOutcome.resource();

        final SmartScopeSet smartScopes = SmartScopeParser.parse(login.scope());

        final ClientApplication client = validateClient();

        final JwtResult accessToken = oauth.generateAccessToken(client, profile, login.scope());

        final JsonObjectBuilder jsonBuilder = Json.createObjectBuilder()
                .add("token_type", "Bearer")
                .add("scope", login.scope())
                .add("expires_in", 3600)
                .add("access_token", accessToken.getJws().getCompactSerialization());

        if (smartScopes.hasProfileAccess()) {
            final JwtResult idToken = oauth.generateIdToken(client, profile);
            jsonBuilder.add("id_token", idToken.getJws().getCompactSerialization());

            if (profile.resourceType().equals(Patient.RESOURCE_TYPE)) {
                jsonBuilder.add("patient", profile.id());
            }
        }

        if (smartScopes.hasOnlineAccess() || smartScopes.hasOfflineAccess()) {
            final JwtResult refreshToken = oauth.generateRefreshToken(client, profile, login.scope());
            jsonBuilder.add("refresh_token", refreshToken.getJws().getCompactSerialization());
        }

        if (smartScopes.hasLaunchAccess()) {
            final URI baseUrl = URI.create((String) config.getProperty(ConfigSettings.BASE_URL));
            final URI smartStyleUrl = UriBuilder.fromUri(baseUrl).path("fhir/R4/.well-known/smart-style").build();
            jsonBuilder.add("need_patient_banner", true);
            jsonBuilder.add("smart_style_url", smartStyleUrl.toString());
        }

        return Response.ok()
                .type(MediaType.APPLICATION_JSON)
                .entity(jsonBuilder.build())
                .build();
    }

    private Response handleClientCredentials() throws JoseException {
        if (clientId == null || clientId.isBlank()) {
            throw new BadRequestException("Missing client_id");
        }

        if (clientSecret == null || clientSecret.isBlank()) {
            throw new BadRequestException("Missing client_secret");
        }

        final ClientApplication client = validateClient();
        if (client.secret() == null || client.secret().isBlank()) {
            throw new BadRequestException("Client not configured for client credentials");
        }

        if (!clientSecret.equals(client.secret())) {
            throw new BadRequestException("Invalid secret");
        }

        final String scope = "";
        final JwtResult accessToken = oauth.generateAccessToken(client, client, scope);

        return Response.ok()
                .type(MediaType.APPLICATION_JSON)
                .entity(Json.createObjectBuilder()
                        .add("access_token", accessToken.getJws().getCompactSerialization())
                        .add("scope", scope)
                        .add("token_type", "Bearer")
                        .add("expires_in", 3600)
                        .build())
                .build();
    }

    private Response handleRefreshToken() throws JoseException {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new BadRequestException("Missing refresh_token");
        }

        final RefreshToken refreshGrant = oauth.validateRefreshToken(refreshToken);
        if (refreshGrant == null) {
            throw new BadRequestException("Invalid refresh_token");
        }

        if (scope == null || scope.isBlank()) {
            scope = refreshGrant.scope();
        }

        final OperationOutcome profileOutcome = repo.readReference(SecurityUser.SYSTEM_USER, refreshGrant.user());
        if (!profileOutcome.isOk()) {
            throw new BadRequestException(profileOutcome.issue().get(0).details().text());
        }

        final FhirResource profile = profileOutcome.resource();

        final ClientApplication client = validateClient();

        final JwtResult accessToken = oauth.generateAccessToken(client, profile, scope);

        final JwtResult newRefreshToken = oauth.generateRefreshToken(client, profile, scope);

        return Response.ok()
                .type(MediaType.APPLICATION_JSON)
                .entity(Json.createObjectBuilder()
                        .add("access_token", accessToken.getJws().getCompactSerialization())
                        .add("refresh_token", newRefreshToken.getJws().getCompactSerialization())
                        .add("scope", scope)
                        .add("token_type", "Bearer")
                        .add("expires_in", 3600)
                        .add("patient", profile.id())
                        .build())
                .build();
    }

    private ClientApplication validateClient() {
        final ClientApplication client;
        if (authorization != null && !authorization.isBlank()) {
            final KeyValue<String, String> usernamePassword = Utils.parseAuthHeader(authorization);

            client = oauth.getClient(usernamePassword.getKey());
            if (client == null) {
                throw new BadRequestException("Invalid client");
            }

            if (!Objects.equals(client.secret(), usernamePassword.getValue())) {
                throw new BadRequestException("Invalid client secret");
            }

        } else if (clientId != null) {
            client = oauth.getClient(clientId);
            if (client == null) {
                throw new BadRequestException("Invalid client_id");
            }

        } else {
            throw new BadRequestException("Missing client");
        }

        return client;
    }
}
