package com.medplum.server.auth;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import org.jose4j.lang.JoseException;

import com.medplum.fhir.r4.FhirMediaType;
import com.medplum.fhir.r4.StandardOutcomes;
import com.medplum.fhir.r4.types.FhirResource;
import com.medplum.fhir.r4.types.Login;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.fhir.r4.types.Reference;
import com.medplum.fhir.r4.types.User;
import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.security.OAuthService;
import com.medplum.server.security.SecurityUser;

@Path("/auth/login")
@Produces(FhirMediaType.APPLICATION_FHIR_JSON)
@PermitAll
public class LoginEndpoint {

    @Inject
    private Repository repo;

    @Inject
    private OAuthService oauth;

    @POST
    @Consumes({ MediaType.APPLICATION_JSON, FhirMediaType.APPLICATION_FHIR_JSON })
    public OperationOutcome submit(final JsonObject loginRequest) throws JoseException {
        final var clientId = loginRequest.getString("clientId", null);
        if (clientId == null || clientId.isBlank()) {
            return StandardOutcomes.invalid("Missing clientId");
        }

        final var email = loginRequest.getString("email", null);
        if (email == null || email.isBlank()) {
            return StandardOutcomes.invalid("Missing email");
        }

        final var password = loginRequest.getString("password", null);
        if (password == null || password.isBlank()) {
            return StandardOutcomes.invalid("Missing password");
        }

        final var scope = loginRequest.getString("scope", null);
        if (scope == null || scope.isBlank()) {
            return StandardOutcomes.invalid("Missing scope");
        }

        final var role = loginRequest.getString("role", null);
        if (role == null || role.isBlank()) {
            return StandardOutcomes.invalid("Missing role");
        }

        final var client = oauth.getClient(clientId);
        if (client == null) {
            return StandardOutcomes.invalid("Invalid clientId");
        }

        final var loginOutcome = oauth.login(client, email, password);
        if (!loginOutcome.isOk()) {
            return loginOutcome;
        }

        final var login = loginOutcome.resource(Login.class);

        final var userOutcome = repo.readReference(SecurityUser.SYSTEM_USER, login.user());
        if (!userOutcome.isOk()) {
            return userOutcome;
        }

        final var user = userOutcome.resource(User.class);

        final Reference roleReference;
        switch (role) {
        case "patient":
            roleReference = user.patient();
            break;

        case "practitioner":
            roleReference = user.practitioner();
            break;

        default:
            return StandardOutcomes.invalid("Unrecognized role: " + role);
        }

        if (roleReference == null) {
            return StandardOutcomes.invalid("User does not have role: " + role);
        }

        final var profileOutcome = repo.readReference(SecurityUser.SYSTEM_USER, roleReference);
        if (!profileOutcome.isOk()) {
            return profileOutcome;
        }

        final var profile = profileOutcome.resource(FhirResource.class);

        oauth.setScopes(login, scope);
        oauth.setRole(login, profile.createReference());

        final var accessToken = oauth.generateAccessToken(client, profile, scope);
        final var newRefreshToken = oauth.generateRefreshToken(client, profile, scope);

        return StandardOutcomes.ok(Json.createObjectBuilder()
                .add("user", user)
                .add("profile", profile)
                .add("accessToken", accessToken.getJws().getCompactSerialization())
                .add("refreshToken", newRefreshToken.getJws().getCompactSerialization())
                .build());
    }
}
