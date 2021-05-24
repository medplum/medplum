package com.medplum.server;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.PreMatching;
import jakarta.ws.rs.ext.Provider;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Provider
@PreMatching
public class LoggingFilter implements ContainerRequestFilter {
    private static final Logger LOG = LoggerFactory.getLogger(LoggingFilter.class);

    @Override
    public void filter(final ContainerRequestContext requestContext) {
        LOG.debug("{} {}", requestContext.getMethod(), requestContext.getUriInfo().getRequestUri());
    }
}
