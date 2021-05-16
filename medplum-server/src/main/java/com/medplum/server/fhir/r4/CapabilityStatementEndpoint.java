package com.medplum.server.fhir.r4;

import static java.util.Collections.*;

import java.net.URI;
import java.util.Arrays;

import jakarta.annotation.security.PermitAll;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Configuration;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriBuilder;

import com.medplum.fhir.r4.FhirMediaType;
import com.medplum.fhir.r4.types.CapabilityStatement;
import com.medplum.fhir.r4.types.CapabilityStatement.CapabilityStatementImplementation;
import com.medplum.fhir.r4.types.CapabilityStatement.CapabilityStatementRest;
import com.medplum.fhir.r4.types.CapabilityStatement.CapabilityStatementSecurity;
import com.medplum.fhir.r4.types.CapabilityStatement.CapabilityStatementSoftware;
import com.medplum.fhir.r4.types.Extension;
import com.medplum.server.ConfigSettings;
import com.medplum.util.JsonUtils;

@Path("/fhir/R4/metadata")
@Produces(FhirMediaType.APPLICATION_FHIR_JSON)
@PermitAll
public class CapabilityStatementEndpoint {
    private static final URI OAUTH_EXTENSION_URL = URI.create("http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris");
    private static final URI TOKEN_EXTENSION_URL = URI.create("token");
    private static final URI AUTHORIZE_EXTENSION_URL = URI.create("authorize");
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

        final String name = "medplum";
        final String version = "0.0.1";

        final URI baseUrl = URI.create((String) config.getProperty(ConfigSettings.BASE_URL));
        final URI tokenUrl = URI.create((String) config.getProperty(ConfigSettings.AUTH_TOKEN_URL));
        final URI authorizeUrl = URI.create((String) config.getProperty(ConfigSettings.AUTH_AUTHORIZE_URL));
        final URI fhirBaseUrl = UriBuilder.fromUri(baseUrl).path("fhir/R4/").build();
        final URI metadataUrl = UriBuilder.fromUri(fhirBaseUrl).path("metadata").build();

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
                                        .url(OAUTH_EXTENSION_URL)
                                        .extension(Arrays.asList(
                                                Extension.create()
                                                        .url(TOKEN_EXTENSION_URL)
                                                        .valueUri(tokenUrl)
                                                        .build(),
                                                Extension.create()
                                                        .url(AUTHORIZE_EXTENSION_URL)
                                                        .valueUri(authorizeUrl)
                                                        .build()))
                                        .build()))
                                .build())
                        .build()))
                .build();
    }
}
