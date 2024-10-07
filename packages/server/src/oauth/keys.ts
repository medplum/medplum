import { randomBytes } from 'crypto';
import {
  JWK,
  JWSHeaderParameters,
  JWTPayload,
  jwtVerify,
  JWTVerifyOptions,
  SignJWT,
} from 'jose';
import { MedplumServerConfig } from '../config';
import { v4 as uuidv4 } from 'uuid';

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

const ALG = 'HS256';
const DEFAULT_REFRESH_LIFETIME = '2w';
const jti: string = uuidv4().replace(/-/g, '');

let issuer: string | undefined;
let secretKey: string | undefined = "C2Nw1vaodwQyLoyzbuquhAwIX0bcfgW7218zGssjHGNwYbHHuy5MvFxTHJvR6wWh";

export async function initKeys(config: MedplumServerConfig): Promise<void> {
  issuer = undefined;

  if (!config) {
    throw new Error('Invalid server configuration');
  }

  issuer = config.issuer;
  if (!issuer) {
    throw new Error('Missing issuer');
  }
}

export function getJwks(): { keys: JWK[] } {
  return { keys: [] };
}

export function getSigningKey(): string {
  return secretKey as string;
}

export function generateSecret(size: number): string {
  return randomBytes(size).toString('hex');
}

export function generateIdToken(claims: MedplumIdTokenClaims): Promise<string> {
  return generateJwt('1h', claims);
}

export function generateAccessToken(
  claims: MedplumAccessTokenClaims,
  additionalClaims?: Record<string, string | number>
): Promise<string> {
  additionalClaims = {
    "token_type" : "access"
  }
  return generateJwt('1h', additionalClaims ? { ...claims, ...additionalClaims } : claims);
}

export function generateRefreshToken(claims: MedplumRefreshTokenClaims, refreshLifetime?: string): Promise<string> {
  const duration = refreshLifetime ?? DEFAULT_REFRESH_LIFETIME;
  return generateJwt(duration, claims);
}

async function generateJwt(exp: string, claims: JWTPayload): Promise<string> {
  if (!secretKey || !issuer) {
    throw new Error('Secret key not initialized');
  }

  const regex = /^[0-9]+[smhdwy]$/;
  if (!regex.test(exp)) {
    throw new Error('Invalid token duration');
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setIssuedAt()
    .setJti(jti)
    .setIssuer(issuer)
    .setAudience(claims.client_id as string)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secretKey))
}

export async function verifyJwt(token: string): Promise<{ payload: JWTPayload; protectedHeader: JWSHeaderParameters }> {
  if (!issuer || !secretKey) {
    throw new Error('Secret key not initialized');
  }

  const verifyOptions: JWTVerifyOptions = {
    issuer,
    algorithms: [ALG],
  };

  return jwtVerify(token, new TextEncoder().encode(secretKey), verifyOptions);
}
