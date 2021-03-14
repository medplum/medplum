package com.medplum.server;

import java.io.IOException;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;

@Provider
public class CorsFilter implements ContainerRequestFilter, ContainerResponseFilter {
    private static final String ALLOW_METHODS = "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD";
    private static final String ALLOW_HEADERS =
            "X-Requested-With" +
            ", Authorization" +
            ", Accept-Version" +
            ", Content-MD5" +
            ", Content-Type" +
            ", CSRF-Token" +
            ", If-Modified-Since" +
            ", If-None-Match";

    @Override
    public void filter(final ContainerRequestContext request) throws IOException {
        if (isOptionsRequest(request) && hasOriginHeader(request)) {
            request.abortWith(Response.ok().build());
        }
    }

    @Override
    public void filter(final ContainerRequestContext request, final ContainerResponseContext response) {
        if (hasOriginHeader(request)) {
            response.getHeaders().add("Access-Control-Allow-Origin", request.getHeaderString("Origin"));
            response.getHeaders().add("Access-Control-Allow-Credentials", "true");
            response.getHeaders().add("Access-Control-Allow-Methods", ALLOW_METHODS);
            response.getHeaders().add("Access-Control-Allow-Headers", ALLOW_HEADERS);
        }
    }

    static boolean isOptionsRequest(final ContainerRequestContext request) {
        return request.getMethod().equalsIgnoreCase("OPTIONS");
    }

    static boolean hasOriginHeader(final ContainerRequestContext request) {
        return request.getHeaderString("Origin") != null;
    }
}
