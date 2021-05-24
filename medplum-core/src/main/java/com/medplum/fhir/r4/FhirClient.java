package com.medplum.fhir.r4;

import static com.medplum.fhir.r4.FhirMediaType.*;

import java.net.URI;
import java.util.Objects;

import jakarta.json.JsonObject;
import jakarta.ws.rs.HttpMethod;
import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.ClientBuilder;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.r4.types.Binary;
import com.medplum.fhir.r4.types.Bundle;
import com.medplum.fhir.r4.types.FhirResource;
import com.medplum.util.JsonUtils;

public class FhirClient {
    private static final Logger LOG = LoggerFactory.getLogger(FhirClient.class);
    private static final String PATH_HISTORY = "_history";
    private static final String PATH_VALIDATE = "$validate";
    private static final String KEY_GRANT_TYPE = "grant_type";
    private static final String KEY_CLIENT_CREDENTIALS = "client_credentials";
    private static final String KEY_CLIENT_ID = "client_id";
    private static final String KEY_CLIENT_SECRET = "client_secret";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";
    private static final String KEY_ACCESS_TOKEN = "access_token";
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
        client.register(FhirFeature.class);

        tokenUrl = builder.tokenUrl;
        clientId = builder.clientId;
        clientSecret = builder.clientSecret;
        accessToken = builder.accessToken;
        refreshToken = builder.refreshToken;
    }

    public URI getBaseUrl() {
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
        return post(UriBuilder.fromUri(baseUrl).path(resource.resourceType()).path(PATH_VALIDATE).build(), resource);
    }

    public Response readMetadata() {
        return get(UriBuilder.fromUri(baseUrl).path("metadata").build());
    }

    public Response read(final String resourceType, final String id) {
        return get(UriBuilder.fromUri(baseUrl).path(resourceType).path(id).build());
    }

    public Response readHistory(final String resourceType, final String id) {
        return get(UriBuilder.fromUri(baseUrl).path(resourceType).path(id).path(PATH_HISTORY).build());
    }

    public Response readVersion(final String resourceType, final String id, final String versionId) {
        return get(UriBuilder.fromUri(baseUrl).path(resourceType).path(id).path(PATH_HISTORY).path(versionId).build());
    }

    public Response update(final FhirResource resource) {
        return put(UriBuilder.fromUri(baseUrl).path(resource.resourceType()).path(resource.id()).build(), resource);
    }

    public Response updateBinary(final String id, final Entity<?> entity) {
        return put(UriBuilder.fromUri(baseUrl).path(Binary.RESOURCE_TYPE).path(id).build(), entity);
    }

    public Response validateUpdate(final FhirResource resource) {
        return post(UriBuilder.fromUri(baseUrl).path(resource.resourceType()).path(resource.id()).path(PATH_VALIDATE).build(), resource);
    }

    public Response delete(final String resourceType, final String id) {
        return delete(UriBuilder.fromUri(baseUrl).path(resourceType).path(id).build());
    }

    public Response validateDelete(final String resourceType, final String id) {
        return delete(UriBuilder.fromUri(baseUrl).path(resourceType).path(id).path(PATH_VALIDATE).build());
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
        if (accessToken == null) {
            getAccessToken();
        }

        final var builder = client.target(uri).request().accept(APPLICATION_FHIR_JSON);
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
        LOG.debug("Requesting access token with client credentials");

        final var formData = new MultivaluedHashMap<String, String>();
        formData.add(KEY_GRANT_TYPE, KEY_CLIENT_CREDENTIALS);
        formData.add(KEY_CLIENT_ID, clientId);
        formData.add(KEY_CLIENT_SECRET, clientSecret);

        final var response = client.target(tokenUrl)
                .request(MediaType.APPLICATION_JSON_TYPE)
                .post(Entity.form(formData));

        final var body = response.readEntity(String.class);

        if (response.getStatus() != 200) {
            throw new IllegalStateException("Error with client credentials: " + body + " (" + response.getStatus() + ")");
        }

        this.accessToken = JsonUtils.readJsonString(body).getString(KEY_ACCESS_TOKEN);
    }

    private void getAccessTokenWithRefreshToken() {
        LOG.debug("Requesting access token with refresh token");

        final var formData = new MultivaluedHashMap<String, String>();
        formData.add(KEY_GRANT_TYPE, KEY_REFRESH_TOKEN);
        formData.add(KEY_REFRESH_TOKEN, refreshToken);

        final var response = client.target(tokenUrl)
                .request(MediaType.APPLICATION_JSON_TYPE)
                .post(Entity.form(formData));

        if (response.getStatus() != 200) {
            throw new IllegalStateException("Error with client credentials");
        }

        final var body = response.readEntity(String.class);
        final var json = JsonUtils.readJsonString(body);
        this.accessToken = json.getString(KEY_ACCESS_TOKEN);
        this.refreshToken = json.getString(KEY_REFRESH_TOKEN);
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
