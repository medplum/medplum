package com.medplum.server.security;

import org.jose4j.jwk.RsaJsonWebKey;
import org.jose4j.jws.JsonWebSignature;

public class JwtResult {
    private final String jwtId;
    private final RsaJsonWebKey jwk;
    private final JsonWebSignature jws;

    public JwtResult(final String jwtId, final RsaJsonWebKey jwk, final JsonWebSignature jws) {
        this.jwtId = jwtId;
        this.jwk = jwk;
        this.jws = jws;
    }

    public String getJwtId() {
        return jwtId;
    }

    public RsaJsonWebKey getJwk() {
        return jwk;
    }

    public JsonWebSignature getJws() {
        return jws;
    }
}
