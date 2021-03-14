package com.medplum.server.security;

public class SecurityContext implements jakarta.ws.rs.core.SecurityContext {
    private static final String OAUTH2 = "OAUTH2";
    private final SecurityUser user;

    public SecurityContext(final SecurityUser user) {
        this.user = user;
    }

    @Override
    public SecurityUser getUserPrincipal() {
        return user;
    }

    @Override
    public boolean isUserInRole(final String role) {
        return false;
    }

    @Override
    public boolean isSecure() {
        return true;
    }

    @Override
    public String getAuthenticationScheme() {
        return OAUTH2;
    }
}
