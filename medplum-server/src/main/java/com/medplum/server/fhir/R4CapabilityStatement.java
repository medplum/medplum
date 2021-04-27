package com.medplum.server.fhir;

import static java.util.Collections.*;

import java.util.Arrays;

import jakarta.annotation.security.PermitAll;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Configuration;
import jakarta.ws.rs.core.Context;

import com.medplum.fhir.FhirMediaType;
import com.medplum.fhir.JsonUtils;
import com.medplum.fhir.types.CapabilityStatement;
import com.medplum.fhir.types.CapabilityStatement.CapabilityStatementImplementation;
import com.medplum.fhir.types.CapabilityStatement.CapabilityStatementRest;
import com.medplum.fhir.types.CapabilityStatement.CapabilityStatementSecurity;
import com.medplum.fhir.types.CapabilityStatement.CapabilityStatementSoftware;
import com.medplum.fhir.types.Extension;
import com.medplum.server.ConfigSettings;

@Path("/fhir/R4/metadata")
@Produces(FhirMediaType.APPLICATION_FHIR_JSON)
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

        final String baseUrl = (String) config.getProperty(ConfigSettings.BASE_URL);
        final String tokenUrl = (String) config.getProperty(ConfigSettings.AUTH_TOKEN_URL);
        final String authorizeUrl = (String) config.getProperty(ConfigSettings.AUTH_AUTHORIZE_URL);

        final String name = "medplum";
        final String version = "0.0.1";
        final String fhirBaseUrl = baseUrl + "/fhir/R4";
        final String metadataUrl = fhirBaseUrl + "/metadata";

        return CapabilityStatement.create(baseStmt)
                .url(metadataUrl)
                .software(CapabilityStatementSoftware.create()
                        .name(name)
                        .version(version)
                        .build())
                .implementation(CapabilityStatementImplementation.create()
                        .description(name)
                        .url(fhirBaseUrl)
                        .build())
                .rest(singletonList(CapabilityStatementRest.create(baseRest)
                        .security(CapabilityStatementSecurity.create()
                                .extension(singletonList(Extension.create()
                                        .url("http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris")
                                        .extension(Arrays.asList(
                                                Extension.create()
                                                        .url("token")
                                                        .valueUri(tokenUrl)
                                                        .build(),
                                                Extension.create()
                                                        .url("authorize")
                                                        .valueUri(authorizeUrl)
                                                        .build()))
                                        .build()))
                                .build())
                        .build()))
                .build();
    }
}
