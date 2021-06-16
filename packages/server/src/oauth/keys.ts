import { JsonWebKey, Operator } from '@medplum/core';
import { fromKeyLike } from 'jose/jwk/from_key_like';
import { parseJwk } from 'jose/jwk/parse';
import { createRemoteJWKSet } from 'jose/jwks/remote';
import { SignJWT } from 'jose/jwt/sign';
import { jwtVerify, JWTVerifyOptions } from 'jose/jwt/verify';
import { generateKeyPair } from 'jose/util/generate_key_pair';
import { FlattenedJWSInput, GetKeyFunction, JWK, JWSHeaderParameters, JWTPayload, KeyLike } from 'jose/webcrypto/types';
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
let publicKeys: JWK[] | undefined;
let signingKey: KeyLike | undefined;
let signingKeyId: string | undefined;
let remoteJwks: GetKeyFunction<JWSHeaderParameters, FlattenedJWSInput> | undefined;

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
  publicKeys = jsonWebKeys.map(jwk => ({
    kid: jwk.id,
    alg: ALG,
    kty: 'RSA',
    use: 'sig',
    e: jwk.e,
    n: jwk.n
  }));

  // Use the first key as the signing key
  signingKeyId = jsonWebKeys[0].id;
  signingKey = await parseJwk({
    ...jsonWebKeys[0],
    alg: ALG,
    use: 'sig',
  });

  // Build the remote key set
  // By default, this points directly to our own /.well-known/jwks.json
  // But we do support remote jwks
  remoteJwks = await createRemoteJWKSet(new URL(config.jwksUrl));
}

/**
 * Returns the current set of active public keys.
 * These keys can be used to verify a JWT.
 * @returns Array of public keys.
 */
export function getJwks(): JWK[] {
  if (!publicKeys) {
    throw new Error('Public keys not initialized');
  }
  return publicKeys;
}

/**
 * Generates a JWT.
 * @param exp Expiration time resolved to a time span.
 * @param claims
 * @returns Promise to generate and sign the JWT.
 */
export async function generateJwt(exp: '1h' | '2w', claims: MedplumClaims): Promise<string> {
  if (!signingKey) {
    throw new Error('Signing key not initialized');
  }

  const issuer = serverConfig?.issuer;
  if (!issuer) {
    throw new Error('Missing issuer');
  }

  const audience = serverConfig?.audience;
  if (!audience) {
    throw new Error('Missing audience');
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
export async function verifyJwt(token: string): Promise<MedplumClaims> {
  if (!remoteJwks) {
    throw new Error('Remote JWKS not initialized');
  }

  const issuer = serverConfig?.issuer;
  if (!issuer) {
    throw new Error('Missing issuer');
  }

  const audience = serverConfig?.audience;
  if (!audience) {
    throw new Error('Missing audience');
  }

  const verifyOptions: JWTVerifyOptions = {
    issuer,
    audience,
    algorithms: [ALG]
  };

  const verifyResult = await jwtVerify(token, remoteJwks, verifyOptions);
  return verifyResult.payload as MedplumClaims;
}
