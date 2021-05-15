package com.medplum.server.oauth2;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
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

import com.medplum.fhir.types.Login;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.fhir.types.Reference;
import com.medplum.fhir.types.User;
import com.medplum.server.ConfigSettings;
import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.security.OAuthService;
import com.medplum.server.security.SecurityUser;

@Path("/oauth2/role")
@Produces(MediaType.TEXT_HTML)
@PermitAll
public class RoleEndpoint {

    @Context
    private Configuration config;

    @Inject
    private Repository repo;

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

    private Login login;
    private User user;
    private List<String> roles;

    @GET
    public Response showScopes() {
        initUser();

        if (roles.isEmpty()) {
            throw new BadRequestException("No roles for this login");
        }

//        if (roles.size() == 1) {
//            // Common case, user only has one role
//            return chooseRole(roles.get(0).createReference());
//        }

        final Map<String, Object> model = new HashMap<>();
        model.put("roles", roles);
        return Response.ok(new Viewable("/roles.mustache", model), MediaType.TEXT_HTML).build();
    }

    @POST
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    public Response submit(@FormParam("role") final String roleStr) {
        initUser();

        final Reference roleReference = getReference(roleStr);
        if (roleReference == null) {
            throw new BadRequestException("Invalid role");
        }

        return chooseRole(roleReference);
    }

    private void initUser() {
        login = oauth.validateCode(code);
        if (login == null) {
            throw new BadRequestException("Invalid code");
        }

        user = repo.readReference(SecurityUser.SYSTEM_USER, login.user()).resource(User.class);
        if (user == null) {
            throw new BadRequestException("User not found");
        }

        roles = new ArrayList<>();
        if (user.patient() != null) {
            roles.add(user.patient().reference());
        }
        if (user.practitioner() != null) {
            roles.add(user.practitioner().reference());
        }
    }

    private Reference getReference(final String roleStr) {
        if (user.patient() != null && user.patient().reference().equals(roleStr)) {
            return user.patient();
        }
        if (user.practitioner() != null && user.practitioner().reference().equals(roleStr)) {
            return user.practitioner();
        }
        return null;
    }

    private Response chooseRole(final Reference role) {
        final OperationOutcome outcome = oauth.setRole(login, role);
        if (!outcome.isOk()) {
            throw new BadRequestException(outcome.issue().get(0).details().text());
        }

        return Response.status(Status.FOUND)
                .location(UriBuilder.fromUri(URI.create((String) config.getProperty(ConfigSettings.BASE_URL)))
                        .path("oauth2/scopes")
                        .queryParam("code", login.id())
                        .queryParam("redirect_uri", redirectUri)
                        .queryParam("state", state)
                        .queryParam("scope", scope)
                        .build())
                .build();
    }
}
