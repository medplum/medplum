package com.medplum.server.security;

import jakarta.annotation.Priority;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.NotAuthorizedException;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ResourceInfo;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;
import jakarta.ws.rs.ext.Provider;

import org.jose4j.jwt.JwtClaims;
import org.jose4j.jwt.MalformedClaimException;
import org.jose4j.jwt.consumer.ErrorCodes;
import org.jose4j.jwt.consumer.InvalidJwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.StandardOperations;
import com.medplum.server.fhir.Fhir;

@Provider
@Priority(Priorities.AUTHENTICATION)
public class SecurityFilter implements ContainerRequestFilter {
    private static final Logger LOG = LoggerFactory.getLogger(SecurityFilter.class);
    private static final String BEARER_PREFIX = "Bearer ";

    @Context
    private ResourceInfo resourceInfo;

    @Inject
    private jakarta.inject.Provider<OAuthService> oauthProvider;

    @Override
    public void filter(final ContainerRequestContext request) {
        if (request.getMethod().equalsIgnoreCase("OPTIONS")) {
            // Always allow OPTIONS requests
            return;
        }

        final Class<?> resourceClass = resourceInfo.getResourceClass();
        if (resourceClass.isAnnotationPresent(PermitAll.class)) {
            // Allow anonymous access to specific endpoints
            return;
        }

        final String authorization = request.getHeaderString(HttpHeaders.AUTHORIZATION);
        if (authorization == null) {
            throw unauthorized("Missing authorization header: " + authorization);
        }

        if (!authorization.startsWith(BEARER_PREFIX)) {
            throw unauthorized("Unsupported authorization method: " + authorization);
        }

        final OAuthService oauth = oauthProvider.get();
        final String token = authorization.substring(BEARER_PREFIX.length());
        final JwtClaims jwt;
        try {
            jwt = oauth.decodeAndVerifyToken(token);

        } catch (final MalformedClaimException ex) {
            throw unauthorized("Malformed claims: " + ex.getMessage());

        } catch (final InvalidJwtException ex) {
            final String message;
            if (ex.hasExpired()) {
                message = "JWT expired";
            } else if (ex.hasErrorCode(ErrorCodes.AUDIENCE_INVALID)) {
                message = "JWT had wrong audience";
            } else {
                LOG.warn("Invalid JWT: {}", ex.getMessage(), ex);
                message = "Invalid JWT";
            }
            throw unauthorized(message);
        }

        request.setSecurityContext(new SecurityContext(new SecurityUser(jwt)));
    }

    private static NotAuthorizedException unauthorized(final String message) {
        return new NotAuthorizedException(
                message,
                Response.status(Status.UNAUTHORIZED)
                    .type(Fhir.FHIR_JSON_CONTENT_TYPE)
                    .entity(StandardOperations.security(message))
                    .build());
    }
}
