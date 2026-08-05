// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OAuthSigningAlgorithm, Operator } from '@medplum/core';
import type { JsonWebKey } from '@medplum/fhirtypes';
import type { JWK, JWSHeaderParameters, JWTPayload, JWTVerifyOptions } from 'jose';
import { exportJWK, generateKeyPair, importJWK, jwtVerify, SignJWT } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import type { MedplumServerConfig } from '../config/types';
import { getGlobalSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';

/**
 * Represents a cryptographic key that can be used for signing or verifying JWTs.
 * Old versions of jose used to export this type, but now we have to define it ourselves.
 */
export type KeyLike = CryptoKey | Uint8Array;

export interface MedplumBaseClaims extends JWTPayload {
  /**
   * Client application ID.
   * This is a reference a ClientApplication resource.
   */
  client_id?: string;

  /**
   * Login ID.
   * This is the UUID of the Login resource.
   */
  login_id: string;
}

export interface MedplumIdTokenClaims extends MedplumBaseClaims {
  name?: string;

  fhirUser?: string;

  nonce: string;
}

export interface MedplumAccessTokenClaims extends MedplumBaseClaims {
  /**
   * OpenID username. Same as JWTPayload.sub.
   */
  username: string;

  /**
   * OpenID scope(s).  Space delimited string.
   * SMART-on-FHIR scopes.
   */
  scope: string;

  /**
   * FHIR profile or role.
   * Qualified reference to the FHIR resource.
   * For example, "Patient/123" or "Practitioner/456".
   */
  profile: string;

  /**
   * User email address.
   * Included when the 'email' scope is requested and the user is a User resource.
   */
  email?: string;
}

export interface MedplumRefreshTokenClaims extends MedplumBaseClaims {
  /**
   * Refresh secret.
   * Due to the powerful nature of a refresh token,
   * we use an additional random secret for security.
   */
  refresh_secret: string;
}

/*
 * JWT signing algorithms.
 *
 * For the first 4 years of this project, Medplum only supported RS256:
 *
 *   RS256 (RSA Signature with SHA-256)
 *
 * This remains one of the most widely deployed JWT algorithms and is used by
 * providers such as AWS Cognito. It uses an RSA public/private key pair, where
 * the server signs with the private key and clients verify signatures using the
 * published public key.
 *
 * In 2025, we added support for elliptic curve algorithms in response to
 * customer requests for FAPI 2 compliance. New keys defaulted to ES256 because
 * it provides equivalent security to 2048-bit RSA with significantly smaller
 * keys and better performance.
 *
 * As CMS interoperability programs evolved, some certification profiles began
 * requiring ES384 (ECDSA using the P-384 curve with SHA-384). New keys now
 * default to ES384 to satisfy those requirements while remaining compatible
 * with modern OAuth 2.0 and OpenID Connect ecosystems.
 *
 * Existing deployments continue to support previously-generated RS256 and
 * ES256 keys for backwards compatibility. New keys use ES384 by default.
 *
 * Notes:
 * - AWS Cognito currently issues RS256 tokens.
 * - Auth0 supports RS256, HS256, PS256, ES256, and ES384.
 */

const PREFERRED_ALG = OAuthSigningAlgorithm.ES384;
const LEGACY_DEFAULT_ALG = OAuthSigningAlgorithm.RS256;
const DEFAULT_ACCESS_LIFETIME = '1h';
const DEFAULT_REFRESH_LIFETIME = '2w';

let issuer: string | undefined;
const publicKeys: Record<string, KeyLike> = {};
const allSigningKeys: Record<string, KeyLike> = {};
const jwks: { keys: JWK[] } = { keys: [] };
let jsonWebKey: JsonWebKey | undefined;
let jsonWebKeys: JsonWebKey[] = [];
let defaultSigningKey: KeyLike | undefined;

export async function initKeys(config: MedplumServerConfig): Promise<void> {
  issuer = undefined;
  jsonWebKey = undefined;
  jsonWebKeys = [];
  defaultSigningKey = undefined;
  jwks.keys = [];

  if (!config) {
    throw new Error('Invalid server configuration');
  }

  issuer = config.issuer;
  if (!issuer) {
    throw new Error('Missing issuer');
  }

  const systemRepo = getGlobalSystemRepo();
  const searchResult = await systemRepo.searchResources<JsonWebKey>({
    resourceType: 'JsonWebKey',
    filters: [{ code: 'active', operator: Operator.EQUALS, value: 'true' }],
  });

  if (searchResult.length > 0) {
    globalLogger.info(`Loaded ${searchResult.length} key(s) from the database`);
    jsonWebKeys = searchResult;
  } else {
    // Generate a key pair
    // https://github.com/panva/jose/blob/main/docs/key/generate_key_pair/functions/generateKeyPair.md
    globalLogger.info('No keys found.  Creating new key...');
    const keyResult = await generateKeyPair(PREFERRED_ALG, { extractable: true });
    const jwk = await exportJWK(keyResult.privateKey);
    const createResult = await systemRepo.createResource({
      resourceType: 'JsonWebKey',
      active: true,
      alg: PREFERRED_ALG,
      ...jwk,
    });
    jsonWebKeys = [createResult];
  }

  // Convert our JsonWebKey array to JWKS
  for (const jwk of jsonWebKeys) {
    jwk.alg ??= LEGACY_DEFAULT_ALG;

    const publicKey: JWK = {
      kid: jwk.id,
      alg: jwk.alg,
      kty: jwk.kty,
      use: 'sig',
    };
    if (jwk.alg === OAuthSigningAlgorithm.ES256 || jwk.alg === OAuthSigningAlgorithm.ES384) {
      publicKey.x = jwk.x;
      publicKey.y = jwk.y;
      publicKey.crv = jwk.crv;
    } else {
      publicKey.e = jwk.e;
      publicKey.n = jwk.n;
    }

    // Add to the JWKS (JSON Web Key Set)
    // This will be publicly available at /.well-known/jwks.json
    jwks.keys.push(publicKey);

    // Convert from JWK to PKCS and add to the collection of public keys
    publicKeys[jwk.id as string] = await importJWK(publicKey);
    allSigningKeys[jwk.id as string] = await importJWK({
      ...(jwk as JWK),
      use: 'sig',
    });
  }

  // Use the first key as the signing key
  jsonWebKey = jsonWebKeys[0];
  defaultSigningKey = allSigningKeys[jsonWebKey.id as string];
}

/**
 * Returns the current set of active public keys.
 * These keys can be used to verify a JWT.
 * @returns Array of public keys.
 */
export function getJwks(): { keys: JWK[] } {
  return jwks;
}

/**
 * Returns the current signing key.
 * @param alg - Optional signing algorithm.  If not provided, the default signing key will be returned.
 * @returns The current signing key.
 */
export function getSigningKey(alg?: string): KeyLike {
  if (!alg) {
    if (!defaultSigningKey) {
      throw new Error('Signing key not initialized');
    }
    return defaultSigningKey;
  }

  const jwk = jsonWebKeys.find((key) => (key.alg ?? LEGACY_DEFAULT_ALG) === alg);
  const key = jwk?.id ? allSigningKeys[jwk.id] : undefined;
  if (!key) {
    throw new Error(`Signing key not found for alg: ${alg}`);
  }
  return key;
}

/**
 * Generates a secure random string suitable for a client secret or refresh secret.
 * @param size - Size of the secret in bytes.  16 recommended for auth codes.  32 recommended for client and refresh secrets.
 * @returns Secure random string.
 */
export function generateSecret(size: number): string {
  return randomBytes(size).toString('hex');
}

/**
 * Generates an ID token JWT.
 * @param claims - The ID token claims.
 * @returns A well-formed JWT that can be used as an ID token.
 */
export function generateIdToken(claims: MedplumIdTokenClaims): Promise<string> {
  return generateJwt('1h', claims);
}

/**
 * Generates an access token JWT.
 * @param claims - The access token claims.
 * @param options - Optional parameters.
 * @param options.additionalClaims - Any additional custom claims.
 * @param options.lifetime - Access token duration.
 * @returns A well-formed JWT that can be used as an access token.
 */
export function generateAccessToken(
  claims: MedplumAccessTokenClaims,
  options?: { additionalClaims?: Record<string, string | number>; lifetime?: string }
): Promise<string> {
  const duration = options?.lifetime ?? DEFAULT_ACCESS_LIFETIME;
  return generateJwt(duration, { aud: issuer, ...claims, ...options?.additionalClaims });
}

/**
 * Generates a refresh token JWT.
 * @param claims - The refresh token claims.
 * @param lifetime - The refresh token duration.
 * @returns A well-formed JWT that can be used as a refresh token.
 */
export function generateRefreshToken(claims: MedplumRefreshTokenClaims, lifetime?: string): Promise<string> {
  const duration = lifetime ?? DEFAULT_REFRESH_LIFETIME;
  return generateJwt(duration, { aud: issuer, ...claims });
}

/**
 * Generates a JWT.
 * @param exp - Expiration time resolved to a time span.
 * @param claims - The key/value pairs to include in the payload section.
 * @returns Promise to generate and sign the JWT.
 */
async function generateJwt(exp: string, claims: JWTPayload): Promise<string> {
  if (!jsonWebKey || !defaultSigningKey || !issuer) {
    throw new Error('Signing key not initialized');
  }

  const regex = /^\d+[smhdwy]$/;
  if (!regex.test(exp)) {
    throw new Error('Invalid token duration');
  }

  return new SignJWT(claims)
    .setProtectedHeader({
      alg: jsonWebKey.alg ?? LEGACY_DEFAULT_ALG,
      kid: jsonWebKey.id,
      typ: 'JWT',
    })
    .setJti(randomUUID())
    .setIssuedAt()
    .setNotBefore(new Date())
    .setIssuer(issuer)
    .setAudience(claims.aud ?? (claims.client_id as string))
    .setExpirationTime(exp)
    .sign(defaultSigningKey);
}

/**
 * Decodes and verifies a JWT.
 * @param token - The jwt token / bearer token.
 * @returns Returns the decoded claims on success.
 */
export async function verifyJwt(token: string): Promise<{ payload: JWTPayload; protectedHeader: JWSHeaderParameters }> {
  if (!issuer) {
    throw new Error('Signing key not initialized');
  }

  const verifyOptions: JWTVerifyOptions = {
    issuer,
    algorithms: [OAuthSigningAlgorithm.ES256, OAuthSigningAlgorithm.ES384, OAuthSigningAlgorithm.RS256],
  };

  return jwtVerify(token, getKeyForHeader, verifyOptions);
}

/**
 * Returns a public key to verify a JWT.
 * Implements the "JWTVerifyGetKey" interface for jwtVerify.
 * @param protectedHeader - The JWT protected header.
 * @returns The public key.
 */
function getKeyForHeader(protectedHeader: JWSHeaderParameters): KeyLike {
  const kid = protectedHeader.kid;
  if (!kid) {
    throw new Error('Missing kid header');
  }

  const result = publicKeys[kid];
  if (!result) {
    throw new Error('Key not found');
  }

  return result;
}
