package com.medplum.fhir;

import static com.medplum.fhir.FhirMediaType.*;

import java.net.URI;
import java.util.Objects;

import jakarta.json.JsonObject;
import jakarta.ws.rs.HttpMethod;
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
        return put("/" + resource.resourceType() + "/" + resource.id(), resource);
    }

    public Response get(final String uri) {
        return method(uri, HttpMethod.GET, null);
    }

    public Response post(final String uri, final Entity<?> entity) {
        return method(uri, HttpMethod.POST, entity);
    }

    public Response post(final String uri, final JsonObject data) {
        return method(uri, HttpMethod.POST, Entity.entity(data, APPLICATION_FHIR_JSON));
    }

    public Response put(final String uri, final Entity<?> entity) {
        return method(uri, HttpMethod.PUT, entity);
    }

    public Response put(final String uri, final JsonObject data) {
        return method(uri, HttpMethod.PUT, Entity.entity(data, APPLICATION_FHIR_JSON));
    }

    private Response method(final String uri, final String method, final Entity<?> entity) {
        final Builder builder = target(uri).request().accept(APPLICATION_FHIR_JSON);
        if (bearerToken != null) {
            builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken);
        }
        return builder.method(method, entity);
    }

    private WebTarget target(final String str) {
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
}
