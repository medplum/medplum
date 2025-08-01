import { Operator } from '@medplum/core';
import { JsonWebKey } from '@medplum/fhirtypes';
import { randomBytes } from 'crypto';
import {
  exportJWK,
  generateKeyPair,
  importJWK,
  JWK,
  JWSHeaderParameters,
  JWTPayload,
  jwtVerify,
  JWTVerifyOptions,
  KeyLike,
  SignJWT,
} from 'jose';
import { MedplumServerConfig } from '../config/types';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';

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
 * Signing algorithms.
 *
 * For the first 4 years of this project, we only supported RS256:
 * RS256 (RSA Signature with SHA-256): An asymmetric algorithm, which means that there are two keys:
 * one public key and one private key that must be kept secret. The server has the private key used to
 * generate the signature, and the consumer of the JWT retrieves a public key from the metadata
 * endpoints provided by the server and uses it to validate the JWT signature.
 *
 * Due to customer requests for FAPI 2 compliance, we are now expanding to support ES256:
 * ES256 (ECDSA using P-256 and SHA-256): An asymmetric algorithm using elliptic curve cryptography.
 * Like RS256, it uses a public/private key pair, but offers better performance characteristics,
 * smaller key sizes, and faster signature generation while providing equivalent security to 2048-bit RSA.
 *
 * To support existing customers and deployments, we will continue to support existing keys using RS256.
 * All new keys will use ES256 by default.
 *
 * Note: AWS Cognito uses RS256. Auth0 supports RS256, HS256, and PS256 options.
 */

const ALG_ES256 = 'ES256';
const ALG_RS256 = 'RS256';
const PREFERRED_ALG = ALG_ES256;
const LEGACY_DEFAULT_ALG = ALG_RS256;
const DEFAULT_ACCESS_LIFETIME = '1h';
const DEFAULT_REFRESH_LIFETIME = '2w';

let issuer: string | undefined;
const publicKeys: Record<string, KeyLike> = {};
const jwks: { keys: JWK[] } = { keys: [] };
let jsonWebKey: JsonWebKey | undefined;
let signingKey: KeyLike | undefined;

export async function initKeys(config: MedplumServerConfig): Promise<void> {
  issuer = undefined;
  jsonWebKey = undefined;
  signingKey = undefined;
  jwks.keys = [];

  if (!config) {
    throw new Error('Invalid server configuration');
  }

  issuer = config.issuer;
  if (!issuer) {
    throw new Error('Missing issuer');
  }

  const systemRepo = getSystemRepo();
  const searchResult = await systemRepo.searchResources<JsonWebKey>({
    resourceType: 'JsonWebKey',
    filters: [{ code: 'active', operator: Operator.EQUALS, value: 'true' }],
  });

  let jsonWebKeys: JsonWebKey[] | undefined;

  if (searchResult.length > 0) {
    globalLogger.info(`Loaded ${searchResult.length} key(s) from the database`);
    jsonWebKeys = searchResult;
  } else {
    // Generate a key pair
    // https://github.com/panva/jose/blob/HEAD/docs/functions/util_generate_key_pair.generatekeypair.md
    globalLogger.info('No keys found.  Creating new key...');
    const keyResult = await generateKeyPair(PREFERRED_ALG);
    const jwk = await exportJWK(keyResult.privateKey);
    const createResult = await systemRepo.createResource<JsonWebKey>({
      resourceType: 'JsonWebKey',
      active: true,
      alg: PREFERRED_ALG,
      ...jwk,
    } as JsonWebKey);
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
    if (jwk.alg === ALG_ES256) {
      publicKey.x = jwk.x;
      publicKey.y = jwk.y;
      publicKey.crv = jwk.crv as string;
    } else {
      publicKey.e = jwk.e;
      publicKey.n = jwk.n;
    }

    // Add to the JWKS (JSON Web Key Set)
    // This will be publicly available at /.well-known/jwks.json
    jwks.keys.push(publicKey);

    // Convert from JWK to PKCS and add to the collection of public keys
    publicKeys[jwk.id as string] = (await importJWK(publicKey)) as KeyLike;
  }

  // Use the first key as the signing key
  jsonWebKey = jsonWebKeys[0];
  signingKey = (await importJWK({
    ...(jsonWebKey as JWK),
    use: 'sig',
  })) as KeyLike;
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
 * @returns The current signing key.
 */
export function getSigningKey(): KeyLike {
  return signingKey as KeyLike;
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
  return generateJwt(duration, options?.additionalClaims ? { ...claims, ...options.additionalClaims } : claims);
}

/**
 * Generates a refresh token JWT.
 * @param claims - The refresh token claims.
 * @param lifetime - The refresh token duration.
 * @returns A well-formed JWT that can be used as a refresh token.
 */
export function generateRefreshToken(claims: MedplumRefreshTokenClaims, lifetime?: string): Promise<string> {
  const duration = lifetime ?? DEFAULT_REFRESH_LIFETIME;

  return generateJwt(duration, claims);
}

/**
 * Generates a JWT.
 * @param exp - Expiration time resolved to a time span.
 * @param claims - The key/value pairs to include in the payload section.
 * @returns Promise to generate and sign the JWT.
 */
async function generateJwt(exp: string, claims: JWTPayload): Promise<string> {
  if (!jsonWebKey || !signingKey || !issuer) {
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
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(claims.client_id as string)
    .setExpirationTime(exp)
    .sign(signingKey);
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
    algorithms: [ALG_ES256, ALG_RS256],
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
