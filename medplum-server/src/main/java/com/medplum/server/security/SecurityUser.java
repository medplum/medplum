package com.medplum.server.security;

import org.jose4j.jwt.JwtClaims;

public class SecurityUser implements java.security.Principal  {
    public static final SecurityUser SYSTEM_USER = new SecurityUser(null);
    private final JwtClaims jwt;
    private final SmartScopeSet smartScopes;

    public SecurityUser(final JwtClaims jwt) {
        this.jwt = jwt;
        this.smartScopes = jwt == null ?
                SmartScopeParser.parse("user/*.*") :
                SmartScopeParser.parse(jwt.getClaimValueAsString("scope"));
    }

    @Override
    public String getName() {
        return "name";
    }

    public JwtClaims getJwt() {
        return jwt;
    }

    public SmartScopeSet getSmartScopes() {
        return smartScopes;
    }
}
