import { JsonWebKey, Operator } from '@medplum/core';
import { fromKeyLike } from 'jose/jwk/from_key_like';
import { parseJwk } from 'jose/jwk/parse';
import { SignJWT } from 'jose/jwt/sign';
import { jwtVerify, JWTVerifyOptions } from 'jose/jwt/verify';
import { generateKeyPair } from 'jose/util/generate_key_pair';
import { JWK, JWSHeaderParameters, JWTPayload, KeyLike } from 'jose/webcrypto/types';
import { MedplumServerConfig } from '../config';
import { isOk, repo } from '../fhir';
import { logger } from '../logger';

export interface MedplumClaims extends JWTPayload {
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
   * Client ID.
   */
  client_id: string;

  /**
   * FHIR profile or role.
   * Qualified reference to the FHIR resource.
   * For example, "Patient/123" or "Practitioner/456".
   */
  profile: string;
}

/**
 * Signing algorithm.
 * This is the algorithm used by AWS Cognito and Auth0.
 */
const ALG = 'RS256';

let serverConfig: MedplumServerConfig | undefined;
const publicKeys: Record<string, KeyLike> = {};
const jwks: { keys: JWK[] } = { keys: [] };
let signingKey: KeyLike | undefined;
let signingKeyId: string | undefined;

export async function initKeys(config: MedplumServerConfig) {
  serverConfig = config;

  const issuer = serverConfig?.issuer;
  if (!issuer) {
    throw new Error('Missing issuer');
  }

  const audience = serverConfig?.audience;
  if (!audience) {
    throw new Error('Missing audience');
  }

  const [searchOutcome, searchResult] = await repo.search({
    resourceType: 'JsonWebKey',
    filters: [{ code: 'active', operator: Operator.EQUALS, value: 'true' }]
  });

  if (!isOk(searchOutcome)) {
    throw new Error('Failed to load keys');
  }

  let jsonWebKeys: JsonWebKey[] | undefined;

  if (searchResult?.entry && searchResult.entry.length > 0) {
    logger.info(`Loaded ${searchResult.entry.length} key(s) from the database`);
    jsonWebKeys = searchResult.entry.map(entry => entry.resource as JsonWebKey);

  } else {
    // Generate a key pair
    // https://github.com/panva/jose/blob/HEAD/docs/functions/util_generate_key_pair.generatekeypair.md
    logger.info('No keys found.  Creating new key...');
    const keyResult = await generateKeyPair(ALG);
    const jwk = await fromKeyLike(keyResult.privateKey);
    const [createOutcome, createResult] = await repo.createResource<JsonWebKey>({
      resourceType: 'JsonWebKey',
      active: true,
      ...jwk
    } as JsonWebKey);

    if (!isOk(createOutcome) || !createResult) {
      throw new Error('Failed to create key');
    }

    jsonWebKeys = [createResult];
  }

  if (!jsonWebKeys || jsonWebKeys.length === 0) {
    throw new Error('Failed to load keys');
  }

  // Convert our JsonWebKey array to JWKS
  for (const jwk of jsonWebKeys) {
    const publicKey: JWK = {
      kid: jwk.id,
      alg: ALG,
      kty: 'RSA',
      use: 'sig',
      e: jwk.e,
      n: jwk.n
    };

    // Add to the JWKS (JSON Web Key Set)
    // This will be publicly available at /.well-known/jwks.json
    jwks.keys.push(publicKey);

    // Convert from JWK to PKCS and add to the collection of public keys
    publicKeys[jwk.id as string] = await parseJwk(publicKey);
  }

  // Use the first key as the signing key
  signingKeyId = jsonWebKeys[0].id;
  signingKey = await parseJwk({
    ...jsonWebKeys[0],
    alg: ALG,
    use: 'sig',
  });
}

/**
 * Returns the current set of active public keys.
 * These keys can be used to verify a JWT.
 * @returns Array of public keys.
 */
export function getJwks(): { keys: JWK[] } {
  if (!jwks) {
    throw new Error('Public keys not initialized');
  }
  return jwks;
}

/**
 * Generates a JWT.
 * @param exp Expiration time resolved to a time span.
 * @param claims
 * @returns Promise to generate and sign the JWT.
 */
export function generateJwt(exp: '1h' | '2w', claims: MedplumClaims): Promise<string> {
  if (!signingKey) {
    return Promise.reject('Signing key not initialized');
  }

  const issuer = serverConfig?.issuer;
  if (!issuer) {
    return Promise.reject('Missing issuer');
  }

  const audience = serverConfig?.audience;
  if (!audience) {
    return Promise.reject('Missing audience');
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALG, kid: signingKeyId })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(exp)
    .sign(signingKey);
}

/**
 * Decodes and verifies a JWT.
 * @param jwt The jwt token / bearer token.
 * @returns Returns the decoded claims on success.
 */
export function verifyJwt(token: string): Promise<MedplumClaims> {
  const issuer = serverConfig?.issuer;
  if (!issuer) {
    return Promise.reject('Missing issuer');
  }

  const audience = serverConfig?.audience;
  if (!audience) {
    return Promise.reject('Missing audience');
  }

  const verifyOptions: JWTVerifyOptions = {
    issuer,
    audience,
    algorithms: [ALG]
  };

  return jwtVerify(token, getKeyForHeader, verifyOptions)
    .then(verifyResult => verifyResult.payload as MedplumClaims);
}

/**
 * Returns a public key to verify a JWT.
 * Implements the "JWTVerifyGetKey" interface for jwtVerify.
 * @param protectedHeader The JWT protected header.
 * @returns Promise to load the public key.
 */
function getKeyForHeader(protectedHeader: JWSHeaderParameters): Promise<KeyLike> {
  const kid = protectedHeader.kid;
  if (!kid) {
    return Promise.reject('Missing kid header');
  }

  const result = publicKeys[kid];
  if (!result) {
    return Promise.reject('Key not found');
  }

  return Promise.resolve(result);
}
