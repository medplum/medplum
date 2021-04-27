package com.medplum.fhir;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.net.URI;

import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.client.Invocation;
import jakarta.ws.rs.client.WebTarget;
import jakarta.ws.rs.core.Response;

import org.junit.Test;

public class FhirClientTest {

    @Test
    public void testGet() {
        final Response response = Response.ok().build();

        final Invocation.Builder builder = mock(Invocation.Builder.class);
        when(builder.accept((String[]) any())).thenReturn(builder);
        when(builder.header(any(), any())).thenReturn(builder);
        when(builder.method(any(), (Entity<?>) isNull())).thenReturn(response);

        final WebTarget target = mock(WebTarget.class);
        when(target.request()).thenReturn(builder);

        final Client innerClient = mock(Client.class);
        when(innerClient.target(any(URI.class))).thenReturn(target);

        final FhirClient client = new FhirClient(URI.create("http://example.com"), "token", innerClient);
        final Response result = client.get("foo");
        assertNotNull(result);
        assertSame(response, result);
    }
}
