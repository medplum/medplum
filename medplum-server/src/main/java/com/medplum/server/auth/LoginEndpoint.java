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

import com.medplum.fhir.FhirMediaType;
import com.medplum.fhir.StandardOutcomes;
import com.medplum.fhir.types.ClientApplication;
import com.medplum.fhir.types.FhirResource;
import com.medplum.fhir.types.Login;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.fhir.types.Reference;
import com.medplum.fhir.types.User;
import com.medplum.server.fhir.repo.Repository;
import com.medplum.server.security.JwtResult;
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
        final String clientId = loginRequest.getString("clientId", null);
        if (clientId == null || clientId.isBlank()) {
            return StandardOutcomes.invalid("Missing clientId");
        }

        final String email = loginRequest.getString("email", null);
        if (email == null || email.isBlank()) {
            return StandardOutcomes.invalid("Missing email");
        }

        final String password = loginRequest.getString("password", null);
        if (password == null || password.isBlank()) {
            return StandardOutcomes.invalid("Missing password");
        }

        final String scope = loginRequest.getString("scope", null);
        if (scope == null || scope.isBlank()) {
            return StandardOutcomes.invalid("Missing scope");
        }

        final String role = loginRequest.getString("role", null);
        if (role == null || role.isBlank()) {
            return StandardOutcomes.invalid("Missing role");
        }

        final ClientApplication client = oauth.getClient(clientId);
        if (client == null) {
            return StandardOutcomes.invalid("Invalid clientId");
        }

        final OperationOutcome loginOutcome = oauth.login(client, email, password);
        if (!loginOutcome.isOk()) {
            return loginOutcome;
        }

        final Login login = loginOutcome.resource(Login.class);

        final OperationOutcome userOutcome = repo.readReference(SecurityUser.SYSTEM_USER, login.user());
        if (!userOutcome.isOk()) {
            return userOutcome;
        }

        final User user = userOutcome.resource(User.class);

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

        final OperationOutcome profileOutcome = repo.readReference(SecurityUser.SYSTEM_USER, roleReference);
        if (!profileOutcome.isOk()) {
            return profileOutcome;
        }

        final FhirResource profile = profileOutcome.resource(FhirResource.class);

        oauth.setScopes(login, scope);
        oauth.setRole(login, profile.createReference());

        final JwtResult accessToken = oauth.generateAccessToken(client, profile, scope);
        final JwtResult newRefreshToken = oauth.generateRefreshToken(client, profile, scope);

        return StandardOutcomes.ok(Json.createObjectBuilder()
                .add("user", user)
                .add("profile", profile)
                .add("accessToken", accessToken.getJws().getCompactSerialization())
                .add("refreshToken", newRefreshToken.getJws().getCompactSerialization())
                .build());
    }
}
