package com.medplum.server.fhir.r4;

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
 * The SmartConfigurationEndpoint handles requests for the SMART-on-FHIR config.
 *
 * See:
 *  1) https://www.hl7.org/fhir/smart-app-launch/conformance/index.html
 *  2) https://www.hl7.org/fhir/uv/bulkdata/authorization/index.html
 */
@Path("/fhir/R4/.well-known/smart-configuration")
@Produces(MediaType.APPLICATION_JSON)
@PermitAll
public class SmartConfigurationEndpoint {

    @Context
    private Configuration config;

    @GET
    public JsonObject getSmartConfiguration() {
        return Json.createObjectBuilder()
                .add("authorization_endpoint", (String) config.getProperty(ConfigSettings.AUTH_AUTHORIZE_URL))
                .add("token_endpoint", (String) config.getProperty(ConfigSettings.AUTH_TOKEN_URL))
                .add("capabilities", Json.createArrayBuilder()
                        .add("client-confidential-symmetric")
                        .add("client-public")
                        .add("context-banner")
                        .add("context-ehr-patient")
                        .add("context-standalone-patient")
                        .add("context-style")
                        .add("launch-ehr")
                        .add("launch-standalone")
                        .add("permission-offline")
                        .add("permission-patient")
                        .add("permission-user")
                        .add("sso-openid-connect")
                        .build())
                .add("token_endpoint_auth_methods", Json.createArrayBuilder()
                        .add("private_key_jwt")
                        .build())
                .add("token_endpoint_auth_signing_alg_values_supported", Json.createArrayBuilder()
                        .add("RS256")
                        .build())
                .build();
    }
}
