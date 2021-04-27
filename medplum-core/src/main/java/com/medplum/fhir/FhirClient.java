package com.medplum.fhir;

import static com.medplum.fhir.FhirMediaType.*;

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

import com.medplum.fhir.types.FhirResource;

public class FhirClient {
    private final URI baseUri;
    private final Client client;
    private final String bearerToken;

    public FhirClient(final URI baseUri, final String bearerToken, final Client client) {
        this.baseUri = Objects.requireNonNull(baseUri);
        this.client = Objects.requireNonNull(client);
        this.bearerToken = bearerToken;

        if (client.getClass().getName().equals("org.glassfish.jersey.client.JerseyClient")) {
            client.property("jersey.config.client.followRedirects", false);
            client.register(FhirObjectReader.class);
        }
    }

    public FhirClient(final URI baseUri, final String auth) {
        this(baseUri, auth, ClientBuilder.newClient());
    }

    public FhirClient(final URI baseUri) {
        this(baseUri, null);
    }

    public Response create(final FhirResource resource) {
        return post("/" + resource.resourceType(), resource);
    }

    public Response read(final String resourceType, final String id) {
        return get("/" + resourceType + "/" + id);
    }

    public Response update(final FhirResource resource) {
        return post("/" + resource.resourceType() + "/" + resource.id(), resource);
    }

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

        return client.target(uri);
    }

    public Response get(final String uri) {
        final Builder builder = target(uri).request().accept(APPLICATION_FHIR_JSON);
        if (bearerToken != null) {
            builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken);
        }
        return builder.get();
    }

    public Response post(final String uri, final Entity<?> entity) {
        final Builder builder = target(uri).request().accept(APPLICATION_FHIR_JSON);
        addAuth(builder);
        return builder.post(entity);
    }

    public Response post(final String uri, final JsonObject data) {
        return post(uri, Entity.entity(data, APPLICATION_FHIR_JSON));
    }

    private void addAuth(final Builder builder) {
        if (bearerToken != null) {
            builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken);
        }
    }
}
