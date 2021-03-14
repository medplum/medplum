package com.medplum.server.endpoints;

import jakarta.annotation.security.PermitAll;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Configuration;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;

import com.medplum.server.ConfigSettings;

/**
 * The OpenIdConnectEndpoint class handles requests for OpenID Connect Discovery.
 *
 * See: https://openid.net/specs/openid-connect-discovery-1_0.html
 */
@Path("/.well-known/openid-configuration")
@Produces(MediaType.APPLICATION_JSON)
@PermitAll
public class OpenIdConnectEndpoint {

    @Context
    private Configuration config;

    @GET
    public JsonObject getSmartConfiguration() {
        return Json.createObjectBuilder()
                .add("issuer", (String) config.getProperty(ConfigSettings.AUTH_ISSUER))
                .add("authorization_endpoint", (String) config.getProperty(ConfigSettings.AUTH_AUTHORIZE_URL))
                .add("token_endpoint", (String) config.getProperty(ConfigSettings.AUTH_TOKEN_URL))
                .add("userinfo_endpoint", (String) config.getProperty(ConfigSettings.AUTH_USER_INFO_URL))
                .add("jwks_uri", (String) config.getProperty(ConfigSettings.AUTH_JWKS_URL))
                .add("id_token_signing_alg_values_supported", Json.createArrayBuilder()
                        .add("RS256")
                        .build())
                .add("response_types_supported", Json.createArrayBuilder()
                        .add("code")
                        .add("id_token")
                        .add("token id_token")
                        .build())
                .add("subject_types_supported", Json.createArrayBuilder()
                        .add("pairwise")
                        .add("public")
                        .build())
                .build();
    }
}
