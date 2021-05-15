package com.medplum.server.oauth2;

import java.util.List;

import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotAuthorizedException;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;
import jakarta.ws.rs.core.SecurityContext;

import org.jose4j.jwt.JwtClaims;
import org.jose4j.jwt.MalformedClaimException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.FhirMediaType;
import com.medplum.fhir.StandardOutcomes;
import com.medplum.fhir.types.ContactPoint;
import com.medplum.fhir.types.FhirResource;
import com.medplum.fhir.types.HumanName;
import com.medplum.fhir.types.Patient;
import com.medplum.fhir.types.Reference;
import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.security.SecurityUser;

/**
 * The UserInfoEndpoint returns the UserInfo claims for the authenticated user.
 *
 * See: https://openid.net/specs/openid-connect-core-1_0.html#UserInfoResponse
 */
@Path("/oauth2/userinfo")
public class UserInfoEndpoint {
    private static final Logger LOG = LoggerFactory.getLogger(UserInfoEndpoint.class);

    @Inject
    private Repository repo;

    @Context
    private SecurityContext securityContext;

    @GET
    public Response userInfo() {
        try {
            final SecurityUser securityUser = (SecurityUser) securityContext.getUserPrincipal();
            final JwtClaims claims = securityUser.getJwt();
            final Reference ref = Reference.create().reference(claims.getStringClaimValue("profile")).build();
            final FhirResource resource = repo.readReference(securityUser, ref).resource();
            return Response.ok()
                    .type(MediaType.APPLICATION_JSON)
                    .entity(buildUserInfo(resource))
                    .build();

        } catch (final MalformedClaimException ex) {
            LOG.debug("{}", ex.getMessage(), ex);
            throw new NotAuthorizedException(
                    Response.status(Status.UNAUTHORIZED)
                        .type(FhirMediaType.APPLICATION_FHIR_JSON)
                        .entity(StandardOutcomes.security("Access denied"))
                        .build());
        }
    }

    private static JsonObject buildUserInfo(final FhirResource resource) {
        final JsonObjectBuilder json = Json.createObjectBuilder();
        json.add("sub", resource.id());
        json.add("profile", resource.createReference().reference());

        if (resource.containsKey(Patient.PROPERTY_NAME)) {
            final List<HumanName> names = resource.getList(HumanName.class, Patient.PROPERTY_NAME);
            if (!names.isEmpty()) {
                final HumanName name = names.get(0);
                final String given = String.join(" ", name.given());
                final String family = name.family();
                json.add("name", (given + " " + family).trim());
                json.add("given_name", given);
                json.add("family_name", family);
            }
        }

        if (resource.containsKey(Patient.PROPERTY_TELECOM)) {
            final List<ContactPoint> telecom = resource.getList(ContactPoint.class, Patient.PROPERTY_TELECOM);
            for (final ContactPoint contactPoint : telecom) {
                if (contactPoint.system().equals("email")) {
                    json.add("email", contactPoint.value());
                } else if (contactPoint.system().equals("telephone")) {
                    json.add("phone", contactPoint.value());
                }
            }
        }

        return json.build();
    }
}
