package com.medplum.server.fhir;

import java.util.Arrays;

import jakarta.annotation.security.PermitAll;
import jakarta.json.Json;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Configuration;
import jakarta.ws.rs.core.Context;

import com.medplum.fhir.JsonUtils;
import com.medplum.fhir.types.CapabilityStatement;
import com.medplum.fhir.types.CapabilityStatement.CapabilityStatementImplementation;
import com.medplum.fhir.types.CapabilityStatement.CapabilityStatementRest;
import com.medplum.fhir.types.CapabilityStatement.CapabilityStatementSecurity;
import com.medplum.fhir.types.CapabilityStatement.CapabilityStatementSoftware;
import com.medplum.server.ConfigSettings;

@Path("/fhir/R4/metadata")
@Produces(Fhir.FHIR_JSON_CONTENT_TYPE)
@PermitAll
public class R4CapabilityStatement {
    private static CapabilityStatement stmt;

    @Context
    private Configuration config;

    @GET
    public CapabilityStatement get() {
        if (stmt == null) {
            stmt = build();
        }
        return stmt;
    }

    private CapabilityStatement build() {
        final CapabilityStatement baseStmt = new CapabilityStatement(JsonUtils.readJsonResourceFile("CapabilityStatement.json"));
        final CapabilityStatementRest baseRest = baseStmt.rest().get(0);

        final String tokenUrl = (String) config.getProperty(ConfigSettings.AUTH_TOKEN_URL);
        final String authorizeUrl = (String) config.getProperty(ConfigSettings.AUTH_AUTHORIZE_URL);

        final String name = "medplum";
        final String version = "0.0.1";
        final String baseUrl = "http://host.docker.internal:5000/fhir/R4";
        final String metadataUrl = baseUrl + "/metadata";

        return CapabilityStatement.create(baseStmt)
                .url(metadataUrl)
                .software(CapabilityStatementSoftware.create()
                        .name(name)
                        .version(version)
                        .build())
                .implementation(CapabilityStatementImplementation.create()
                        .description(name)
                        .url(baseUrl)
                        .build())
                .rest(Arrays.asList(CapabilityStatementRest.create(baseRest)
                        .security(new CapabilityStatementSecurity(Json.createObjectBuilder()
                                .add("extension", Json.createArrayBuilder()
                                        .add(Json.createObjectBuilder()
                                                .add("url", "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris")
                                                .add("extension", Json.createArrayBuilder()
                                                        .add(Json.createObjectBuilder()
                                                                .add("url", "token")
                                                                .add("valueUri", tokenUrl)
                                                                .build())
                                                        .add(Json.createObjectBuilder()
                                                                .add("url", "authorize")
                                                                .add("valueUri", authorizeUrl)
                                                                .build())
                                                        .build())
                                                .build())
                                        .build())
                                .build()))
                        .build()))
                .build();
    }
}
