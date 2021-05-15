package com.medplum.fhir.r4;

import static com.medplum.fhir.r4.FhirMediaType.*;

import java.net.URI;
import java.util.Objects;

import jakarta.json.JsonObject;
import jakarta.ws.rs.HttpMethod;
import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.ClientBuilder;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.client.Invocation.Builder;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;

import com.medplum.fhir.r4.types.Binary;
import com.medplum.fhir.r4.types.Bundle;
import com.medplum.fhir.r4.types.FhirResource;

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

    public URI getBaseUri() {
        return baseUri;
    }

    public Response createBatch(final Bundle bundle) {
        return post(baseUri, bundle);
    }

    public Response createBinary(final Entity<?> entity) {
        return post(UriBuilder.fromUri(baseUri).path(Binary.RESOURCE_TYPE).build(), entity);
    }

    public Response create(final FhirResource resource) {
        return post(UriBuilder.fromUri(baseUri).path(resource.resourceType()).build(), resource);
    }

    public Response readMetadata() {
        return get(UriBuilder.fromUri(baseUri).path("metadata").build());
    }

    public Response read(final String resourceType, final String id) {
        return get(UriBuilder.fromUri(baseUri).path(resourceType).path(id).build());
    }

    public Response readHistory(final String resourceType, final String id) {
        return get(UriBuilder.fromUri(baseUri).path(resourceType).path(id).path("_history").build());
    }

    public Response readVersion(final String resourceType, final String id, final String versionId) {
        return get(UriBuilder.fromUri(baseUri).path(resourceType).path(id).path("_history").path(versionId).build());
    }

    public Response update(final FhirResource resource) {
        return put(UriBuilder.fromUri(baseUri).path(resource.resourceType()).path(resource.id()).build(), resource);
    }

    public Response search(final String resourceType, final String query) {
        return get(UriBuilder.fromUri(baseUri).path(resourceType).replaceQuery(query).build());
    }

    public Response get(final URI uri) {
        return method(uri, HttpMethod.GET, null);
    }

    public Response post(final URI uri, final Entity<?> entity) {
        return method(uri, HttpMethod.POST, entity);
    }

    public Response post(final URI uri, final JsonObject data) {
        return method(uri, HttpMethod.POST, Entity.entity(data, APPLICATION_FHIR_JSON));
    }

    public Response put(final URI uri, final Entity<?> entity) {
        return method(uri, HttpMethod.PUT, entity);
    }

    public Response put(final URI uri, final JsonObject data) {
        return method(uri, HttpMethod.PUT, Entity.entity(data, APPLICATION_FHIR_JSON));
    }

    private Response method(final URI uri, final String method, final Entity<?> entity) {
        final Builder builder = client.target(uri).request().accept(APPLICATION_FHIR_JSON);
        if (bearerToken != null) {
            builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken);
        }
        return builder.method(method, entity);
    }
}
