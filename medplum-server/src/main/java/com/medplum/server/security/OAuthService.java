package com.medplum.server.security;

import java.util.Map;
import java.util.Map.Entry;
import java.util.UUID;

import jakarta.inject.Inject;
import jakarta.ws.rs.core.Configuration;
import jakarta.ws.rs.core.Context;

import org.jose4j.jwa.AlgorithmConstraints.ConstraintType;
import org.jose4j.jwk.JsonWebKeySet;
import org.jose4j.jwk.RsaJsonWebKey;
import org.jose4j.jws.AlgorithmIdentifiers;
import org.jose4j.jws.JsonWebSignature;
import org.jose4j.jwt.JwtClaims;
import org.jose4j.jwt.MalformedClaimException;
import org.jose4j.jwt.consumer.InvalidJwtException;
import org.jose4j.jwt.consumer.JwtConsumer;
import org.jose4j.jwt.consumer.JwtConsumerBuilder;
import org.jose4j.keys.resolvers.VerificationKeyResolver;
import org.jose4j.lang.JoseException;
import org.mindrot.jbcrypt.BCrypt;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.StandardOperations;
import com.medplum.fhir.types.Bundle;
import com.medplum.fhir.types.ClientApplication;
import com.medplum.fhir.types.FhirResource;
import com.medplum.fhir.types.Login;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.fhir.types.Reference;
import com.medplum.fhir.types.RefreshToken;
import com.medplum.fhir.types.User;
import com.medplum.server.ConfigSettings;
import com.medplum.server.fhir.repo.Repository;
import com.medplum.server.search.SearchRequest;
import com.medplum.server.search.SearchRequestParser;

public class OAuthService {
    private static final Logger LOG = LoggerFactory.getLogger(OAuthService.class);
    private static final int ONE_HOUR = 1;
    private static final int TWO_WEEKS = 14 * 24;

    @Context
    private Configuration config;

    @Inject
    private Repository repo;

    @Inject
    private JsonWebKeySet jwks;

    @Inject
    private VerificationKeyResolver keyResolver;

    public OAuthService() {
        // No-arg constructor for DI
    }

    public OAuthService(
            final Configuration config,
            final Repository repo,
            final JsonWebKeySet jwks,
            final VerificationKeyResolver keyResolver) {
        this.config = config;
        this.repo = repo;
        this.jwks = jwks;
        this.keyResolver = keyResolver;
    }

    public String getIssuer() {
        return (String) config.getProperty(ConfigSettings.AUTH_ISSUER);
    }

    public JsonWebKeySet getJwks() {
        return jwks;
    }

    public RsaJsonWebKey getJwk() {
        return (RsaJsonWebKey) jwks.getJsonWebKeys().get(0);
    }

    public VerificationKeyResolver getKeyResolver() {
        return keyResolver;
    }

    /**
     * Searches for user by email.
     * @param email
     * @return
     */
    public OperationOutcome getUserByEmail(final String email) {
        final SearchRequest searchRequest = SearchRequestParser.parse(User.RESOURCE_TYPE, User.PROPERTY_EMAIL, email);
        return repo.search(SecurityUser.SYSTEM_USER, searchRequest);
    }

    /**
     * Logs in the user with email address and password.
     * Returns the user on success.
     *
     * @param email The user's email address.
     * @param password The user's plain text password.
     * @return the user details.
     */
    public OperationOutcome login(final String email, final String password) {
        final OperationOutcome outcome = getUserByEmail(email);
        if (!outcome.isOk()) {
            return outcome;
        }

        final Bundle bundle = outcome.resource(Bundle.class);
        if (bundle.entry().isEmpty()) {
            return StandardOperations.notFound();
        }

        final User user = bundle.entry().get(0).resource(User.class);
        final String passwordHash = user.passwordHash();
        if (passwordHash == null || passwordHash.isBlank()) {
            return StandardOperations.security("User does not have a password");
        }

        if (!BCrypt.checkpw(password, passwordHash)) {
            return StandardOperations.security("Bad password");
        }

        final Login loginResource = Login.create()
                .user(user.createReference())
                .build();

        return repo.create(SecurityUser.SYSTEM_USER, loginResource);
    }

    public OperationOutcome getLoginProfile(final Login login) {
        final Reference reference = login.user();
        if (reference == null || reference.reference() == null || !reference.reference().startsWith(User.RESOURCE_TYPE)) {
            return StandardOperations.invalid("Missing login user");
        }

        final OperationOutcome outcome = repo.readReference(SecurityUser.SYSTEM_USER, reference);
        if (!outcome.isOk()) {
            return outcome;
        }

        final Reference profileReference = login.profile();
        if (profileReference == null) {
            return StandardOperations.invalid("Missing login profile");
        }

        final User user = outcome.resource(User.class);
        if (!profileReference.reference().equals(user.patient().reference()) &&
                !profileReference.reference().equals(user.practitioner().reference())) {
            return StandardOperations.invalid("Invalid login profile");
        }

        return repo.readReference(SecurityUser.SYSTEM_USER, profileReference);
    }

    public boolean validateClient(final String clientId) {
        final OperationOutcome outcome = repo.read(SecurityUser.SYSTEM_USER, ClientApplication.RESOURCE_TYPE, clientId);
        return outcome.isOk();
    }

    public ClientApplication getClient(final String clientId) {
        final OperationOutcome outcome = repo.read(SecurityUser.SYSTEM_USER, ClientApplication.RESOURCE_TYPE, clientId);
        if (!outcome.isOk()) {
            return null;
        }
        return outcome.resource(ClientApplication.class);
    }

    public Login validateCode(final String code) {
        final OperationOutcome outcome = repo.read(SecurityUser.SYSTEM_USER, Login.RESOURCE_TYPE, code);
        if (!outcome.isOk()) {
            return null;
        }
        return outcome.resource(Login.class);
    }

    public OperationOutcome setScopes(final Login login, final String scope) {
        final Login updated = Login.create(login).scope(scope).build();
        return repo.update(SecurityUser.SYSTEM_USER, updated.id(), updated);
    }

    public OperationOutcome setRole(final Login login, final Reference role) {
        final Login updated = Login.create(login).profile(role).build();
        return repo.update(SecurityUser.SYSTEM_USER, updated.id(), updated);
    }

    public RefreshToken validateRefreshToken(final String refreshToken) {
        final String keyId;
        try {
            keyId = decodeAndVerifyToken(refreshToken).getJwtId();
        } catch (MalformedClaimException | InvalidJwtException ex) {
            LOG.debug("Invalid refresh token: {}", ex.getMessage(), ex);
            return null;
        }

        final OperationOutcome outcome = repo.read(SecurityUser.SYSTEM_USER, RefreshToken.RESOURCE_TYPE, keyId);
        if (!outcome.isOk()) {
            return null;
        }
        return outcome.resource(RefreshToken.class);
    }

    public JwtResult generateAccessToken(
            final ClientApplication client,
            final FhirResource profile,
            final String scope)
                    throws JoseException {

        return generateJwt(Map.of(
                "sub", profile.id(),
                "token_use", "access",
                "scope", scope,
                "client_id", client.id(),
                "username", profile.id(),
                "profile", profile.createReference().reference()
              ), ONE_HOUR);
    }

    public JwtResult generateRefreshToken(
            final ClientApplication client,
            final FhirResource profile,
            final String scope)
                    throws JoseException {

        final JwtResult result = generateJwt(Map.of(
                "sub", profile.id(),
                "scope", scope
              ), TWO_WEEKS);

        final RefreshToken refreshToken = RefreshToken.create()
                .user(profile.createReference())
                .scope(scope)
                .build();

        // Use "update" rather than "create" to specify the ID
        // Most users do not have the right to do this, but system user does
        // Because we trust that JWT ID will be a unique UUID
        repo.update(
                SecurityUser.SYSTEM_USER,
                result.getJwtId(),
                refreshToken);

        return result;
    }

    public JwtResult generateIdToken(
            final ClientApplication client,
            final FhirResource profile)
                    throws JoseException {

        return generateJwt(Map.of(
                "sub", profile.id(),
                "aud", client.id(),
                "fhirUser", profile.createReference().reference()
              ), ONE_HOUR);
    }

    private JwtResult generateJwt(final Map<String, Object> payload, final int expirationHours) throws JoseException {
        LOG.info("Generate JWT issuer: {}", getIssuer());

        // Based on: https://bitbucket.org/b_c/jose4j/wiki/JWT%20Examples
        final String jwtId = UUID.randomUUID().toString();
        final RsaJsonWebKey jwk = getJwk();

        final JwtClaims claims = new JwtClaims();
        claims.setIssuer(getIssuer());
        claims.setExpirationTimeMinutesInTheFuture(60.0f * expirationHours);
        claims.setJwtId(jwtId);
        claims.setIssuedAtToNow();
        claims.setNotBeforeMinutesInThePast(2);

        for (final Entry<String, Object> entry : payload.entrySet()) {
            claims.setClaim(entry.getKey(), entry.getValue());
        }

        final JsonWebSignature jws = new JsonWebSignature();
        jws.setPayload(claims.toJson());
        jws.setKey(jwk.getPrivateKey());
        jws.setKeyIdHeaderValue(jwk.getKeyId());
        jws.setAlgorithmHeaderValue(AlgorithmIdentifiers.RSA_USING_SHA256);

        // Sign the JWS and produce the compact serialization or the complete JWT/JWS
        // representation, which is a string consisting of three dot ('.') separated
        // base64url-encoded parts in the form Header.Payload.Signature
        // If you wanted to encrypt it, you can simply set this jwt as the payload
        // of a JsonWebEncryption object and set the cty (Content Type) header to "jwt".
        return new JwtResult(jwtId, jwk, jws);
    }

    public JwtClaims decodeAndVerifyToken(final String token) throws MalformedClaimException, InvalidJwtException {
        // Based on: https://bitbucket.org/b_c/jose4j/wiki/JWT%20Examples
        final String issuer = getIssuer();
        final VerificationKeyResolver keyResolver = getKeyResolver();

        // Use JwtConsumerBuilder to construct an appropriate JwtConsumer, which will
        // be used to validate and process the JWT.
        // The specific validation requirements for a JWT are context dependent, however,
        // it typically advisable to require a (reasonable) expiration time, a trusted issuer, and
        // and audience that identifies your system as the intended recipient.
        // If the JWT is encrypted too, you need only provide a decryption key or
        // decryption key resolver to the builder.
        final JwtConsumer jwtConsumer = new JwtConsumerBuilder()
                .setRequireExpirationTime() // the JWT must have an expiration time
                .setAllowedClockSkewInSeconds(30) // allow some leeway in validating time based claims to account for clock skew
                .setRequireSubject() // the JWT must have a subject claim
                .setExpectedIssuer(issuer)
                .setVerificationKeyResolver(keyResolver) // verify the signature with the public key
                .setJwsAlgorithmConstraints(ConstraintType.PERMIT, AlgorithmIdentifiers.RSA_USING_SHA256)
                .build(); // create the JwtConsumer instance
        return jwtConsumer.processToClaims(token);
    }
}
