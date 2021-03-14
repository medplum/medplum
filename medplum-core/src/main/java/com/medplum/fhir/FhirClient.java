package com.medplum.fhir;

import java.net.URI;
import java.util.Objects;

import jakarta.json.JsonObject;
import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.ClientBuilder;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.client.Invocation.Builder;
import jakarta.ws.rs.client.WebTarget;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

public class FhirClient {
    public static final String FHIR_JSON_CONTENT_TYPE = "application/fhir+json";
    private final URI baseUri;
    private final Client client;
    private final String bearerToken;

    public FhirClient(final URI baseUri, final String bearerToken, final Client client) {
        this.baseUri = Objects.requireNonNull(baseUri);
        this.client = Objects.requireNonNull(client);
        this.bearerToken = bearerToken;

        client.property("jersey.config.client.followRedirects", false);
        client.register(FhirObjectReader.class);
//        client.register(OAuth2ClientSupport.feature(bearerToken));
    }

    public FhirClient(final URI baseUri, final String auth) {
        this(baseUri, auth, ClientBuilder.newClient());
    }

//    public FhirClient(final URI baseUri, final Client client) {
//        this(baseUri, client, null);
//    }
//
//    public FhirClient(final URI baseUri) {
//        this(baseUri, ClientBuilder.newClient());
//    }

    public WebTarget target(final String str) {
        final URI uri;
        if (str.startsWith("http")) {
            if (!str.startsWith(baseUri.toString())) {
                throw new RuntimeException("Absolute URL does not begin with baseUri");
            }
            uri = URI.create(str);
        } else {
            uri = URI.create(baseUri.toString() + str);
        }

        final WebTarget target = client.target(uri);

//        if (uri.getQuery() != null) {
//            for (final String param : uri.getQuery().split("&")) {
//                final String[] keyValue = param.split("=");
//                target = target.queryParam(keyValue[0], keyValue[1]);
//            }
//        }

        return target;
    }

    public Response get(final String uri) {
        final Builder builder = target(uri).request().accept(FHIR_JSON_CONTENT_TYPE);
        if (bearerToken != null) {
            builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken);
        }
        return builder.get();
//        return target(uri).request().accept(FHIR_JSON_CONTENT_TYPE).get();
    }

    public Response post(final String uri, final JsonObject data) {
        final Builder builder = target(uri).request().accept(FHIR_JSON_CONTENT_TYPE);
        if (bearerToken != null) {
            builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken);
        }
        return builder.post(Entity.entity(data, FHIR_JSON_CONTENT_TYPE));
//        return target(uri).request().accept(FHIR_JSON_CONTENT_TYPE).post(Entity.entity(data, FHIR_JSON_CONTENT_TYPE));
    }
}
