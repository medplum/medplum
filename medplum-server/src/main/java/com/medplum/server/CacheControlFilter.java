package com.medplum.server;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.container.PreMatching;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.ext.Provider;

@Provider
@PreMatching
public class CacheControlFilter implements ContainerResponseFilter {

    @Override
    public void filter(final ContainerRequestContext request, final ContainerResponseContext response) {
        response.getHeaders().add(HttpHeaders.CACHE_CONTROL, "no-cache, no-store, must-revalidate");
        response.getHeaders().add(HttpHeaders.EXPIRES, "0");
        response.getHeaders().add("Pragma", "no-cache");
    }
}
