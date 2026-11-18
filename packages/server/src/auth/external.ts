// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  badRequest,
  concatUrls,
  ContentType,
  encodeBase64,
  isString,
  OAuthGrantType,
  OAuthTokenAuthMethod,
  OperationOutcomeError,
  parseJWTPayload,
  resolveId,
} from '@medplum/core';
import type { ClientApplication, DomainConfiguration, IdentityProvider, Project, User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import { getConfig } from '../config/loader';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../fhir/repo';
import { getLogger, globalLogger } from '../logger';
import { getClientRedirectUri } from '../oauth/clients';
import type { CodeChallengeMethod } from '../oauth/utils';
import { getClientApplication, hashCode, isExternalEmailUnverified, tryLogin } from '../oauth/utils';
import { getCacheRedis } from '../redis';
import { safeFetch } from '../util/url';
import { makeValidationMiddleware } from '../util/validator';
import { getDomainConfiguration } from './method';

/*
 * External authentication callback
 * Based on: https://github.com/okta/okta-auth-js/blob/master/samples/generated/express-web-with-oidc/server.js
 */

export interface ExternalAuthState {
  domain?: string;
  issuer?: string;
  projectId?: string;
  clientId?: string;
  scope?: string;
  nonce?: string;
  launch?: string;
  codeChallenge?: string;
  codeChallengeMethod?: CodeChallengeMethod;
  redirectUri?: string;
  returnTo?: string;
}

const EXTERNAL_AUTH_STATE_FIELDS = [
  'domain',
  'issuer',
  'projectId',
  'clientId',
  'scope',
  'nonce',
  'launch',
  'codeChallenge',
  'codeChallengeMethod',
  'redirectUri',
  'returnTo',
] as const;

/** Long enough for a slow sign-in at the identity provider, such as one with MFA. */
export const EXTERNAL_AUTH_STATE_TTL_SECONDS = 10 * 60;
const MAX_EXTERNAL_AUTH_STATE_FIELD_LENGTH = 4096;

interface ExternalAuthStateRecord {
  loginRequest: ExternalAuthState;
  /** Sent as `code_verifier` to the identity provider token endpoint when `usePkce` is set. */
  idpVerifier?: string;
  /** Undefined for the shared `/auth/external` callback. */
  callbackClientId?: string;
}

type IdentitySource = NonNullable<IdentityProvider['identitySource']>;
type IdentityMappingMode = NonNullable<IdentityProvider['identityMappingMode']>;

export interface ExternalLoginIdentity {
  email?: string;
  externalId?: string;
}

export const externalStartValidator = makeValidationMiddleware([
  body([...EXTERNAL_AUTH_STATE_FIELDS])
    .optional()
    .isString()
    .isLength({ max: MAX_EXTERNAL_AUTH_STATE_FIELD_LENGTH }),
  body('codeChallenge').notEmpty().withMessage('Missing code challenge'),
  body('codeChallengeMethod').isIn(['S256', 'plain']).withMessage('Invalid code challenge method'),
]);

/**
 * Starts sign in with an external identity provider: stores the login request under a random `state` and returns
 * the identity provider authorize URL. The callback trusts only the stored request, not its own URL.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function externalStartHandler(req: Request, res: Response): Promise<void> {
  const loginRequest: ExternalAuthState = {};
  for (const field of EXTERNAL_AUTH_STATE_FIELDS) {
    if (req.body[field] !== undefined) {
      (loginRequest as Record<string, string>)[field] = req.body[field];
    }
  }

  // Client identity providers always use the per-client callback
  let client: ClientApplication | undefined;
  let callbackClientId: string | undefined;
  if (loginRequest.clientId) {
    client = await getClientApplication(loginRequest.clientId);
    if (client.identityProvider) {
      callbackClientId = loginRequest.clientId;
    }
  }

  let domainConfig: DomainConfiguration | undefined;
  if (loginRequest.domain && callbackClientId === undefined) {
    domainConfig = await getDomainConfiguration(loginRequest.domain);
  }

  const { idp } = await getIdentityProvider(loginRequest, domainConfig, callbackClientId);
  if (!idp?.authorizeUrl || !idp.clientId) {
    sendOutcome(res, badRequest('Identity provider not found'));
    return;
  }

  if (client) {
    if (loginRequest.projectId !== undefined && loginRequest.projectId !== client.meta?.project) {
      sendOutcome(res, badRequest('Invalid project'));
      return;
    }
    if (loginRequest.redirectUri && !(await matchClientRedirectUri(client, loginRequest.redirectUri))) {
      sendOutcome(res, badRequest('Invalid redirect URI'));
      return;
    }
  }

  if (loginRequest.returnTo && domainConfig && !isValidReturnToUrl(loginRequest.returnTo, domainConfig)) {
    sendOutcome(res, badRequest('Invalid returnTo URL'));
    return;
  }

  let url: URL;
  try {
    url = new URL(idp.authorizeUrl);
  } catch {
    sendOutcome(res, badRequest('Invalid authorize URL for external identity provider'));
    return;
  }

  if (loginRequest.codeChallengeMethod === 'plain') {
    getLogger().warn('External auth start with plain code challenge', {
      clientId: loginRequest.clientId,
      domain: loginRequest.domain,
      issuer: loginRequest.issuer,
    });
  }

  const state = randomBytes(32).toString('base64url');
  const idpVerifier = idp.usePkce ? randomBytes(32).toString('base64url') : undefined;
  const record: ExternalAuthStateRecord = { loginRequest, idpVerifier, callbackClientId };
  await getCacheRedis().set(
    getExternalAuthStateKey(state),
    JSON.stringify(record),
    'EX',
    EXTERNAL_AUTH_STATE_TTL_SECONDS
  );

  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', idp.clientId);
  url.searchParams.set('redirect_uri', getExternalCallbackUrl(callbackClientId));
  // Matches the scope sent by `getExternalAuthRedirectUri` (client) and `isExternalAuth` (domain)
  url.searchParams.set(
    'scope',
    (callbackClientId === undefined ? undefined : loginRequest.scope) ?? 'openid profile email'
  );
  url.searchParams.set('state', state);
  if (idpVerifier) {
    url.searchParams.set('code_challenge', hashCode(idpVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
  }

  res.status(200).json({ url: url.toString() });
}

export async function externalCallbackHandler(req: Request, res: Response): Promise<void> {
  // Set when the identity provider redirected to the per-client callback path /auth/external/:clientId
  const callbackClientId = req.params.clientId as string | undefined;

  const code = req.query.code as string;
  if (!code) {
    sendOutcome(res, badRequest('Missing code'));
    return;
  }

  const state = req.query.state as string;
  if (!state) {
    sendOutcome(res, badRequest('Missing state'));
    return;
  }

  // JSON state is the legacy form built by the browser; any other state was issued by externalStartHandler
  const jsonState = state.startsWith('{');
  let body: ExternalAuthState;
  let idpVerifier: string | undefined;
  if (jsonState) {
    try {
      body = JSON.parse(state);
    } catch {
      sendOutcome(res, badRequest('Invalid state'));
      return;
    }
    idpVerifier = body.codeChallenge;
  } else {
    // Single use
    const value = await getCacheRedis().getdel(getExternalAuthStateKey(state));
    if (!value) {
      sendOutcome(res, badRequest('Invalid state'));
      return;
    }
    const record = JSON.parse(value) as ExternalAuthStateRecord;
    if (record.callbackClientId !== callbackClientId) {
      sendOutcome(res, badRequest('Invalid client'));
      return;
    }
    body = record.loginRequest;
    idpVerifier = record.idpVerifier;
  }

  if (callbackClientId !== undefined && body.clientId !== callbackClientId) {
    sendOutcome(res, badRequest('Invalid client'));
    return;
  }

  // The per-client path only uses its client's identity provider and redirect URIs
  let domainConfig: DomainConfiguration | undefined;
  if (body.domain && callbackClientId === undefined) {
    domainConfig = await getDomainConfiguration(body.domain);
  }

  const { idp, client } = await getIdentityProvider(body, domainConfig, callbackClientId);
  if (!idp) {
    sendOutcome(res, badRequest('Identity provider not found'));
    return;
  }

  // RFC 9207: if the identity provider reports its issuer, it must match the configured issuer
  const iss = req.query.iss;
  if (iss !== undefined && idp.issuer && iss !== idp.issuer) {
    sendOutcome(res, badRequest('Invalid issuer'));
    return;
  }

  const userInfo = await verifyExternalCode(idp, code, idpVerifier, callbackClientId);

  let identity: ExternalLoginIdentity;
  try {
    identity = await resolveExternalLoginIdentity(idp, userInfo);
  } catch (err) {
    if (err instanceof OperationOutcomeError) {
      sendOutcome(res, err.outcome);
      return;
    }
    throw err;
  }

  if (identity.email && isExternalEmailUnverified(userInfo)) {
    getLogger().warn('External identity provider reported unverified email', {
      clientId: client?.id,
      projectId: client?.meta?.project,
      domain: domainConfig?.domain,
      issuer: idp.issuer,
    });
  }

  if (body.domain && !identity.email?.endsWith('@' + body.domain)) {
    sendOutcome(res, badRequest('Email address does not match domain'));
    return;
  }

  let projectId = body.projectId;
  if (client) {
    if (projectId !== undefined && projectId !== client.meta?.project) {
      sendOutcome(res, badRequest('Invalid project'));
      return;
    }
    projectId = client.meta?.project;
  }

  const login = await tryLogin({
    authMethod: 'external',
    email: identity.email,
    externalId: identity.externalId,
    projectId,
    clientId: body.clientId,
    scope: body.scope ?? 'openid offline_access',
    nonce: body.nonce ?? randomUUID(),
    launchId: body.launch,
    codeChallenge: body.codeChallenge,
    codeChallengeMethod: body.codeChallengeMethod,
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  if (callbackClientId === undefined && client?.identityProvider) {
    getLogger().warn('Client identity provider signed in through the shared external auth callback', {
      clientId: client.id,
      projectId: client.meta?.project,
    });
  }

  if (jsonState) {
    getLogger().warn('External auth signed in with JSON state', {
      clientId: body.clientId,
      projectId,
      domain: body.domain,
      issuer: idp.issuer,
      callback: callbackClientId === undefined ? 'shared' : 'per-client',
    });
  }

  // The identity provider authenticated the user, which is the control this flag records.
  await getGlobalSystemRepo().patchResource<User>('User', resolveId(login.user) as string, [
    { op: 'add', path: '/emailVerified', value: true },
  ]);

  if (login.membership && body.redirectUri && client) {
    const redirectUri = await matchClientRedirectUri(client, body.redirectUri);
    if (!redirectUri) {
      sendOutcome(res, badRequest('Invalid redirect URI'));
      return;
    }

    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('login', login.id);
    redirectUrl.searchParams.set('code', login.code as string);
    res.redirect(redirectUrl.toString());
    return;
  }

  let signInPage: string;
  if (isValidReturnToUrl(body.returnTo, domainConfig)) {
    // This is the case for external auth with a returnTo URL specified in the state.
    signInPage = body.returnTo;
  } else {
    // This is the fallback case for external auth without a client application or redirect URI.
    signInPage = concatUrls(getConfig().appBaseUrl, login.launch ? 'oauth' : 'signin');
  }

  const redirectUrl = new URL(signInPage, getConfig().appBaseUrl);
  redirectUrl.searchParams.set('login', login.id);
  redirectUrl.searchParams.set('scope', login.scope as string);
  redirectUrl.searchParams.set('nonce', login.nonce as string);
  // A plain challenge is the verifier itself, so keep it out of the URL
  if (login.codeChallenge && login.codeChallengeMethod !== 'plain') {
    redirectUrl.searchParams.set('code_challenge', login.codeChallenge);
    redirectUrl.searchParams.set('code_challenge_method', login.codeChallengeMethod as string);
  }
  res.redirect(redirectUrl.toString());
}

/**
 * Tries to find the identity provider configuration.
 * @param state - The external auth state.
 * @param domainConfig - The domain configuration.
 * @param callbackClientId - The client ID from the per-client callback path, if any.
 * @returns External identity provider definition if found.
 */
async function getIdentityProvider(
  state: ExternalAuthState,
  domainConfig: DomainConfiguration | undefined,
  callbackClientId: string | undefined
): Promise<{ idp?: IdentityProvider; client?: ClientApplication }> {
  let idp: IdentityProvider | undefined;
  let client: ClientApplication | undefined;

  if (callbackClientId !== undefined) {
    // The per-client path only serves that client's identity provider
    client = await getClientApplication(callbackClientId);
    return { idp: client.identityProvider, client };
  }

  if (state.clientId) {
    client = await getClientApplication(state.clientId);
    if (client.identityProvider) {
      if (!(await isLegacyExternalAuthAllowed(client))) {
        getLogger().warn('Client identity provider refused on the shared external auth callback', {
          clientId: client.id,
          projectId: client.meta?.project,
        });
        throw new OperationOutcomeError(
          badRequest(
            `Client identity provider must use the per-client callback ${getConfig().baseUrl}auth/external/${client.id}`
          )
        );
      }
      return { idp: client.identityProvider, client };
    }
  }

  if (domainConfig?.identityProvider) {
    idp = domainConfig.identityProvider;
  }

  if (!idp && state.issuer) {
    idp = getConfig().externalAuthProviders?.find((provider) => provider.issuer === state.issuer)?.identityProvider;
  }

  return { idp, client };
}

/**
 * Maps the claims from an external identity provider to the identity used to look up the Medplum user.
 * Every flow that signs in a user from external claims must use this, so that they agree on who the user is.
 * @param idp - The identity provider configuration.
 * @param userInfo - The claims from the external identity provider.
 * @returns The email or external ID to log in with.
 */
export async function resolveExternalLoginIdentity(
  idp: IdentityProvider,
  userInfo: Record<string, unknown>
): Promise<ExternalLoginIdentity> {
  const identitySource = getIdentitySource(idp);
  const identityMappingMode = getIdentityMappingMode(idp);

  if (identitySource === 'email' && identityMappingMode === 'user-email') {
    let email: string | undefined;
    if (isString(userInfo.email)) {
      email = userInfo.email.toLowerCase();
    }
    if (!email) {
      throw new OperationOutcomeError(badRequest('External token does not contain email address'));
    }
    return { email };
  }

  if (identitySource === 'subject' && identityMappingMode === 'project-membership-external-id') {
    let externalId: string | undefined;
    if (isString(userInfo.sub)) {
      externalId = userInfo.sub;
    }
    if (!externalId) {
      throw new OperationOutcomeError(badRequest('External token does not contain subject'));
    }
    return { externalId };
  }

  throw new OperationOutcomeError(badRequest('Unsupported identity provider configuration'));
}

function getIdentitySource(idp: IdentityProvider): IdentitySource {
  // Fallback to preserve legacy behavior
  return idp.identitySource ?? (idp.useSubject ? 'subject' : 'email');
}

function getIdentityMappingMode(idp: IdentityProvider): IdentityMappingMode {
  // Fallback to preserve legacy behavior
  return idp.identityMappingMode ?? (idp.useSubject ? 'project-membership-external-id' : 'user-email');
}

/**
 * Returns ID token claims for the authorization code.
 * @param idp - The identity provider configuration.
 * @param code - The authorization code.
 * @param codeVerifier - The code verifier.
 * @param callbackClientId - The client ID from the per-client callback path, if any.
 * @returns ID token claims.
 */
async function verifyExternalCode(
  idp: IdentityProvider,
  code: string,
  codeVerifier: string | undefined,
  callbackClientId: string | undefined
): Promise<Record<string, unknown>> {
  if (!idp.tokenUrl) {
    throw new OperationOutcomeError(badRequest('Missing token URL for external identity provider'));
  }

  const headers: HeadersInit = {
    Accept: ContentType.JSON,
    'Accept-Encoding': 'identity',
    'Content-Type': ContentType.FORM_URL_ENCODED,
  };

  const params = new URLSearchParams();
  params.append('grant_type', OAuthGrantType.AuthorizationCode);
  // Must match the redirect_uri of the authorization request
  params.append('redirect_uri', getExternalCallbackUrl(callbackClientId));
  params.append('code', code);

  if (idp.usePkce && codeVerifier) {
    params.append('code_verifier', codeVerifier);
  }

  if (idp.tokenAuthMethod === OAuthTokenAuthMethod.ClientSecretPost) {
    if (!idp.clientId || !idp.clientSecret) {
      throw new OperationOutcomeError(badRequest('Missing client ID or client secret for external identity provider'));
    }

    params.append('client_id', idp.clientId);
    params.append('client_secret', idp.clientSecret);
  } else {
    // Default to client_secret_basic
    headers.Authorization = `Basic ${encodeBase64(idp.clientId + ':' + idp.clientSecret)}`;
  }

  try {
    const response = await safeFetch(idp.tokenUrl, {
      method: 'POST',
      headers,
      body: params.toString(),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      globalLogger.warn('Bad response from external auth check', { status: response.status, body: responseBody });
      throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
    }

    return await verifyExternalIdToken(idp, responseBody.id_token);
  } catch (err: any) {
    if (err instanceof OperationOutcomeError) {
      // Preserve specific validation messages (e.g. from id_token verification).
      throw err;
    }
    globalLogger.warn('Unhandled error in external auth check', err);
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }
}

/**
 * Parses the id_token returned by the external identity provider, verifying its signature when a
 * JWKS is available.
 *
 * When the identity provider publishes a JWKS (`jwksUrl`), the id_token signature and issuer are
 * checked before the claims are read. The audience is checked against `idp.audience` when set,
 * otherwise against `idp.clientId`, since an OIDC id_token is audienced to the client it was issued
 * for. Providers without a configured `jwksUrl` retain the existing behavior of relying on the
 * server-to-server token endpoint response; configuring `jwksUrl` (and `issuer`) is recommended so
 * that claims are cryptographically verified.
 * @param idp - The identity provider configuration.
 * @param idToken - The raw id_token from the token endpoint response.
 * @returns The id_token claims.
 */
async function verifyExternalIdToken(idp: IdentityProvider, idToken: unknown): Promise<Record<string, unknown>> {
  if (!isString(idToken)) {
    throw new OperationOutcomeError(badRequest('Missing id_token in external identity provider response'));
  }

  if (idp.jwksUrl) {
    if (!idp.issuer) {
      throw new OperationOutcomeError(badRequest('Missing issuer for external identity provider'));
    }
    const jwks = createRemoteJWKSet(new URL(idp.jwksUrl), { [customFetch]: safeFetch });
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: idp.issuer,
      audience: idp.audience ?? idp.clientId,
    });
    return payload;
  }

  return parseJWTPayload(idToken);
}

/**
 * Returns the redirect URI registered with the identity provider.
 * @param callbackClientId - The client ID for the per-client callback, or undefined for the shared callback.
 * @returns The callback URL.
 */
function getExternalCallbackUrl(callbackClientId: string | undefined): string {
  return getConfig().baseUrl + 'auth/external' + (callbackClientId === undefined ? '' : '/' + callbackClientId);
}

function getExternalAuthStateKey(state: string): string {
  return 'medplum:external-auth-state:' + state;
}

async function matchClientRedirectUri(client: ClientApplication, requestedUri: string): Promise<string | undefined> {
  let redirectUri = getClientRedirectUri(client, requestedUri);

  if (!redirectUri && (await isDangerousRedirectUriPartialMatchAllowed(client))) {
    // If projects have the allow-dangerous-redirect setting enabled, then we will allow partial matches for redirect URIs.
    // This is generally NOT recommended by the OAuth spec.
    // However, we need to support it here for backwards compatibility with existing clients.
    redirectUri = getClientRedirectUri(client, requestedUri, true);
    getLogger().warn('Redirect URI does not match any of the client application redirect URIs', {
      clientId: client.id,
      requestedUri,
      partialMatchUri: redirectUri,
    });
  }

  return redirectUri;
}

/**
 * Determines if the returnTo URL is valid based on the domain configuration.
 * @param returnTo - The returnTo URL from the external auth state.
 * @param domainConfig - The domain configuration for the external auth request.
 * @returns True if the returnTo URL is valid, false otherwise.
 */
function isValidReturnToUrl(
  returnTo: string | undefined,
  domainConfig: DomainConfiguration | undefined
): returnTo is string {
  if (!returnTo) {
    return false;
  }

  try {
    const returnToUrl = new URL(returnTo);
    return !!domainConfig?.allowedPostLoginRedirectUrls?.some((allowedUrl) => {
      try {
        const allowed = new URL(allowedUrl);
        return (
          returnToUrl.protocol === allowed.protocol &&
          returnToUrl.hostname === allowed.hostname &&
          returnToUrl.port === allowed.port &&
          returnToUrl.pathname.startsWith(allowed.pathname)
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Returns true if the client's Project may use the shared /auth/external callback for its client identity providers.
 * Read from Project.systemSetting, which only super admins can set.
 * Clients without a Project (server config `defaultOAuthClients`, or created by a super admin) are always allowed.
 * @param client - The client application.
 * @returns True if the shared callback is allowed for the client.
 */
async function isLegacyExternalAuthAllowed(client: ClientApplication): Promise<boolean> {
  if (!client.meta?.project) {
    return true;
  }
  const project = await getGlobalSystemRepo().readResource<Project>('Project', client.meta.project);
  return project.systemSetting?.find((s) => s.name === 'legacyExternalAuth')?.valueBoolean === true;
}

/**
 * Returns true if the client application allows partial matching of redirect URIs, false otherwise.
 * @param client - The client application.
 * @returns True if partial matching is allowed, false otherwise.
 */
async function isDangerousRedirectUriPartialMatchAllowed(client: ClientApplication): Promise<boolean> {
  const systemRepo = getGlobalSystemRepo();
  const project = await systemRepo.readResource<Project>('Project', client.meta?.project as string);
  return project.setting?.find((s) => s.name === 'allow-dangerous-redirect')?.valueBoolean === true;
}
