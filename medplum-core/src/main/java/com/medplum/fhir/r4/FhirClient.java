package com.medplum.fhir.r4;

import static com.medplum.fhir.r4.FhirMediaType.*;

import java.net.URI;
import java.util.Objects;

import jakarta.json.JsonObject;
import jakarta.ws.rs.HttpMethod;
import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.ClientBuilder;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.client.Invocation;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;

import com.medplum.fhir.r4.types.Binary;
import com.medplum.fhir.r4.types.Bundle;
import com.medplum.fhir.r4.types.FhirResource;
import com.medplum.util.JsonUtils;

public class FhirClient {
    private final URI baseUrl;
    private final URI tokenUrl;
    private final Client client;
    private final String clientId;
    private final String clientSecret;
    private String accessToken;
    private String refreshToken;

    public static Builder builder() {
        return new Builder();
    }

    private FhirClient(final Builder builder) {
        baseUrl = Objects.requireNonNull(builder.baseUrl, "Base URL must not be null");
        client = Objects.requireNonNull(builder.client, "Client must not be null");
        tokenUrl = builder.tokenUrl;
        clientId = builder.clientId;
        clientSecret = builder.clientSecret;
        accessToken = builder.accessToken;
        refreshToken = builder.refreshToken;

        if (accessToken == null) {
            getAccessToken();
        }
    }

    public URI getBaseUri() {
        return baseUrl;
    }

    public Response createBatch(final Bundle bundle) {
        return post(baseUrl, bundle);
    }

    public Response createBinary(final Entity<?> entity) {
        return post(UriBuilder.fromUri(baseUrl).path(Binary.RESOURCE_TYPE).build(), entity);
    }

    public Response create(final FhirResource resource) {
        return post(UriBuilder.fromUri(baseUrl).path(resource.resourceType()).build(), resource);
    }

    public Response validateCreate(final FhirResource resource) {
        return post(UriBuilder.fromUri(baseUrl).path(resource.resourceType()).path("$validate").build(), resource);
    }

    public Response readMetadata() {
        return get(UriBuilder.fromUri(baseUrl).path("metadata").build());
    }

    public Response read(final String resourceType, final String id) {
        return get(UriBuilder.fromUri(baseUrl).path(resourceType).path(id).build());
    }

    public Response readHistory(final String resourceType, final String id) {
        return get(UriBuilder.fromUri(baseUrl).path(resourceType).path(id).path("_history").build());
    }

    public Response readVersion(final String resourceType, final String id, final String versionId) {
        return get(UriBuilder.fromUri(baseUrl).path(resourceType).path(id).path("_history").path(versionId).build());
    }

    public Response update(final FhirResource resource) {
        return put(UriBuilder.fromUri(baseUrl).path(resource.resourceType()).path(resource.id()).build(), resource);
    }

    public Response validateUpdate(final FhirResource resource) {
        return post(UriBuilder.fromUri(baseUrl).path(resource.resourceType()).path(resource.id()).path("$validate").build(), resource);
    }

    public Response delete(final String resourceType, final String id) {
        return delete(UriBuilder.fromUri(baseUrl).path(resourceType).path(id).build());
    }

    public Response validateDelete(final String resourceType, final String id) {
        return delete(UriBuilder.fromUri(baseUrl).path(resourceType).path(id).path("$validate").build());
    }

    public Response search(final String resourceType, final String query) {
        return get(UriBuilder.fromUri(baseUrl).path(resourceType).replaceQuery(query).build());
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

    public Response delete(final URI uri) {
        return method(uri, HttpMethod.DELETE, null);
    }

    private Response method(final URI uri, final String method, final Entity<?> entity) {
        final Invocation.Builder builder = client.target(uri).request().accept(APPLICATION_FHIR_JSON);
        if (accessToken != null) {
            builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken);
        }
        return builder.method(method, entity);
    }

    private void getAccessToken() {
        if (tokenUrl != null && clientId != null && clientSecret != null) {
            getAccessTokenWithClientCredentials();
        } else if (tokenUrl != null && refreshToken != null) {
            getAccessTokenWithRefreshToken();
        } else {
            accessToken = null;
        }
    }

    private void getAccessTokenWithClientCredentials() {
        final MultivaluedMap<String, String> formData = new MultivaluedHashMap<>();
        formData.add("grant_type", "client_credentials");
        formData.add("client_id", clientId);
        formData.add("client_secret", clientSecret);

        final Response response = client.target(tokenUrl)
                .request(MediaType.APPLICATION_JSON_TYPE)
                .post(Entity.form(formData));

        final String body = response.readEntity(String.class);

        if (response.getStatus() != 200) {
            throw new IllegalStateException("Error with client credentials: " + body + " (" + response.getStatus() + ")");
        }

        final JsonObject json = JsonUtils.readJsonString(body);
        this.accessToken = json.getString("access_token");
    }

    private void getAccessTokenWithRefreshToken() {
        final MultivaluedMap<String, String> formData = new MultivaluedHashMap<>();
        formData.add("grant_type", "refresh_token");
        formData.add("refresh_token", refreshToken);

        final Response response = client.target(tokenUrl)
                .request(MediaType.APPLICATION_JSON_TYPE)
                .post(Entity.form(formData));

        if (response.getStatus() != 200) {
            throw new IllegalStateException("Error with client credentials");
        }

        final String body = response.readEntity(String.class);
        final JsonObject json = JsonUtils.readJsonString(body);
        this.accessToken = json.getString("access_token");
        this.refreshToken = json.getString("refresh_token");
    }

    public static class Builder {
        private URI baseUrl;
        private URI tokenUrl;
        private Client client;
        private String clientId;
        private String clientSecret;
        private String accessToken;
        private String refreshToken;

        public Builder baseUrl(final URI baseUrl) {
            this.baseUrl = baseUrl;
            return this;
        }

        public Builder tokenUrl(final URI tokenUrl) {
            this.tokenUrl = tokenUrl;
            return this;
        }

        public Builder client(final Client client) {
            this.client = client;
            return this;
        }

        public Builder accessToken(final String accessToken) {
            this.accessToken = accessToken;
            return this;
        }

        public Builder refreshToken(final String refreshToken) {
            this.refreshToken = refreshToken;
            return this;
        }

        public Builder clientCredentials(final String clientId, final String clientSecret) {
            this.clientId = clientId;
            this.clientSecret = clientSecret;
            return this;
        }

        public FhirClient build() {
            if (this.client == null) {
                this.client = ClientBuilder.newClient();
            }

            return new FhirClient(this);
        }
    }
}
