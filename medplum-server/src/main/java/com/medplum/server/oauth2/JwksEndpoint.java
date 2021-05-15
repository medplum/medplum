package com.medplum.server.oauth2;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.json.JsonObject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import org.jose4j.jwk.JsonWebKey;

import com.medplum.fhir.JsonUtils;
import com.medplum.server.security.OAuthService;

@Path("/.well-known/jwks.json")
@PermitAll
public class JwksEndpoint {

    @Inject
    private OAuthService oauth;

    @GET
    public Response getJwks() {
        final String str = oauth.getJwks().toJson(JsonWebKey.OutputControlLevel.PUBLIC_ONLY);
        final JsonObject json = JsonUtils.readJsonString(str);
        return Response.ok()
                .type(MediaType.APPLICATION_JSON)
                .entity(json)
                .build();
    }
}
