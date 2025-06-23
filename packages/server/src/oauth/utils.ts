import {
  badRequest,
  ContentType,
  createReference,
  Filter,
  forbidden,
  getDateProperty,
  getReferenceString,
  isJwt,
  isString,
  OperationOutcomeError,
  Operator,
  parseJWTPayload,
  parseSearchRequest,
  ProfileResource,
  resolveId,
  SearchRequest,
  tooManyRequests,
  WithId,
} from '@medplum/core';
import {
  AccessPolicy,
  ClientApplication,
  IdentityProvider,
  Login,
  Project,
  ProjectMembership,
  Reference,
  ResourceType,
  SmartAppLaunch,
  User,
} from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { Request } from 'express';
import { IncomingMessage } from 'http';
import { JWTPayload, jwtVerify, VerifyOptions } from 'jose';
import fetch from 'node-fetch';
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { authenticator } from 'otplib';
import { getUserConfiguration } from '../auth/me';
import { getConfig } from '../config/loader';
import { MedplumExternalAuthConfig } from '../config/types';
import { getAccessPolicyForLogin, getRepoForLogin } from '../fhir/accesspolicy';
import { getSystemRepo } from '../fhir/repo';
import { parseSmartScopes, SmartScope } from '../fhir/smart';
import { getLogger } from '../logger';
import { getRedis } from '../redis';
import {
  AuditEventOutcome,
  createAuditEvent,
  logAuditEvent,
  LoginEvent,
  UserAuthenticationEvent,
} from '../util/auditevent';
import { getStandardClientById } from './clients';
import {
  generateAccessToken,
  generateIdToken,
  generateRefreshToken,
  generateSecret,
  MedplumAccessTokenClaims,
  verifyJwt,
} from './keys';
import { AuthState } from './middleware';

export type CodeChallengeMethod = 'plain' | 'S256';

export interface LoginRequest {
  readonly email?: string;
  readonly externalId?: string;
  readonly authMethod: 'password' | 'google' | 'external' | 'exchange';
  readonly password?: string;
  readonly scope: string;
  readonly nonce: string;
  readonly resourceType?: ResourceType;
  readonly projectId?: string;
  readonly clientId?: string;
  readonly launchId?: string;
  readonly codeChallenge?: string;
  readonly codeChallengeMethod?: CodeChallengeMethod;
  readonly googleCredentials?: GoogleCredentialClaims;
  readonly remoteAddress?: string;
  readonly userAgent?: string;
  readonly allowNoMembership?: boolean;
  readonly origin?: string;
  /** @deprecated Use scope of "offline" or "offline_access" instead. */
  readonly remember?: boolean;
}

export interface TokenResult {
  readonly idToken: string;
  readonly accessToken: string;
  readonly refreshToken?: string;
}

/**
 * The decoded payload of Google Credentials.
 */
export interface GoogleCredentialClaims extends JWTPayload {
  /**
   * If present, the host domain of the user's GSuite email address.
   */
  readonly hd: string;

  /**
   * The user's email address.
   */
  readonly email: string;

  /**
   * True if Google has verified the email address.
   */
  readonly email_verified: boolean;

  /**
   * The user's full name.
   */
  readonly name: string;
  readonly given_name: string;
  readonly family_name: string;

  /**
   * If present, a URL to the user's profile picture.
   */
  readonly picture: string;
}

/**
 * Returns the client application by ID.
 * Handles special cases for "built-in" clients.
 * @param clientId - The client ID.
 * @returns The client application.
 */
export async function getClientApplication(clientId: string): Promise<ClientApplication> {
  const standardClient = getStandardClientById(clientId);
  if (standardClient) {
    return standardClient;
  }
  const systemRepo = getSystemRepo();
  return systemRepo.readResource<ClientApplication>('ClientApplication', clientId);
}

export async function tryLogin(request: LoginRequest): Promise<WithId<Login>> {
  validateLoginRequest(request);

  let client: ClientApplication | undefined;
  if (request.clientId) {
    client = await getClientApplication(request.clientId);
    if (client.allowedOrigin && request.origin) {
      if (!client.allowedOrigin.some((o) => o === request.origin)) {
        throw new OperationOutcomeError(badRequest('Invalid origin'));
      }
    }
  }

  validatePkce(request, client);

  const systemRepo = getSystemRepo();
  let launch: SmartAppLaunch | undefined;
  if (request.launchId) {
    launch = await systemRepo.readResource<SmartAppLaunch>('SmartAppLaunch', request.launchId);
  }

  let user: User | undefined = undefined;
  if (request.externalId) {
    user = await getUserByExternalId(request.externalId, request.projectId as string);
  } else if (request.email) {
    user = await getUserByEmail(request.email, request.projectId);
  }

  if (!user) {
    getLogger().warn('tryLogin User not found', { ...request, password: undefined, codeChallenge: undefined });
    throw new OperationOutcomeError(badRequest('User not found'));
  }

  await authenticate(request, user);

  const refreshSecret = includeRefreshToken(request) ? generateSecret(32) : undefined;

  const login = await systemRepo.createResource<Login>({
    resourceType: 'Login',
    client: client && createReference(client),
    launch: launch && createReference(launch),
    project: request.projectId ? { reference: 'Project/' + request.projectId } : undefined,
    profileType: request.resourceType,
    user: createReference(user),
    authMethod: request.authMethod,
    authTime: new Date().toISOString(),
    code: generateSecret(16),
    cookie: generateSecret(16),
    refreshSecret,
    scope: request.scope,
    nonce: request.nonce,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: request.codeChallengeMethod,
    remoteAddress: request.remoteAddress,
    userAgent: request.userAgent,
  });

  // Try to get user memberships
  // If they only have one membership, set it now
  // Otherwise the application will need to prompt the user
  const memberships = await getMembershipsForLogin(login);

  if (memberships.length === 0 && !request.allowNoMembership) {
    throw new OperationOutcomeError(badRequest('User not found'));
  }

  if (memberships.length === 1) {
    return setLoginMembership(login, memberships[0].id);
  } else {
    return login;
  }
}

export function validateLoginRequest(request: LoginRequest): void {
  if (request.authMethod === 'external' || request.authMethod === 'exchange') {
    if (!request.externalId && !request.email) {
      throw new OperationOutcomeError(badRequest('Missing email or externalId', 'externalId'));
    } else if (request.externalId && !request.projectId) {
      throw new OperationOutcomeError(badRequest('Project ID is required for external ID', 'projectId'));
    }
  } else if (!request.email) {
    throw new OperationOutcomeError(badRequest('Invalid email', 'email'));
  } else if (!request.authMethod) {
    throw new OperationOutcomeError(badRequest('Invalid authentication method', 'authMethod'));
  } else if (request.authMethod === 'password' && !request.password) {
    throw new OperationOutcomeError(badRequest('Invalid password', 'password'));
  } else if (request.authMethod === 'google' && !request.googleCredentials) {
    throw new OperationOutcomeError(badRequest('Invalid google credentials', 'googleCredentials'));
  } else if (!request.scope) {
    throw new OperationOutcomeError(badRequest('Invalid scope', 'scope'));
  }
}

export function validatePkce(request: LoginRequest, client: ClientApplication | undefined): void {
  if (client?.pkceOptional) {
    return;
  }

  if (!request.codeChallenge && request.codeChallengeMethod) {
    throw new OperationOutcomeError(badRequest('Invalid code challenge', 'code_challenge'));
  }

  if (request.codeChallenge && !request.codeChallengeMethod) {
    throw new OperationOutcomeError(badRequest('Invalid code challenge method', 'code_challenge_method'));
  }

  if (
    request.codeChallengeMethod &&
    request.codeChallengeMethod !== 'plain' &&
    request.codeChallengeMethod !== 'S256'
  ) {
    throw new OperationOutcomeError(badRequest('Invalid code challenge method', 'code_challenge_method'));
  }
}

async function authenticate(request: LoginRequest, user: User): Promise<void> {
  if (request.password && user.passwordHash) {
    const bcryptResult = await bcrypt.compare(request.password, user.passwordHash as string);
    if (!bcryptResult) {
      throw new OperationOutcomeError(badRequest('Email or password is invalid'));
    }
    return;
  }

  if (request.googleCredentials) {
    // Verify Google user id
    return;
  }

  if (request.authMethod === 'external' || request.authMethod === 'exchange') {
    // Verified by external auth provider
    return;
  }

  throw new OperationOutcomeError(badRequest('Invalid authentication method'));
}

/**
 * Verifies the MFA token for a login.
 * Ensures that the login is valid.
 * Ensures that the token is valid.
 * On success, updates the login with the MFA status.
 * On error, throws an error.
 * @param login - The login resource.
 * @param token - The user supplied MFA token.
 * @returns The updated login resource.
 */
export async function verifyMfaToken(login: Login, token: string): Promise<Login> {
  if (login.revoked) {
    throw new OperationOutcomeError(badRequest('Login revoked'));
  }

  if (login.granted) {
    throw new OperationOutcomeError(badRequest('Login granted'));
  }

  if (login.mfaVerified) {
    throw new OperationOutcomeError(badRequest('Login already verified'));
  }

  const systemRepo = getSystemRepo();
  const user = await systemRepo.readReference(login.user as Reference<User>);
  if (!user.mfaEnrolled) {
    throw new OperationOutcomeError(badRequest('User not enrolled in MFA'));
  }

  const secret = user.mfaSecret as string;
  if (!authenticator.check(token, secret)) {
    throw new OperationOutcomeError(badRequest('Invalid MFA token'));
  }

  return systemRepo.updateResource<Login>({
    ...login,
    mfaVerified: true,
  });
}

/**
 * Returns a list of profiles that the user has access to.
 * When a user logs in, gather all the available profiles.
 * If there is only one profile, then automatically select it.
 * Otherwise, the user must select a profile.
 * @param login - The login resource.
 * @returns Array of profile resources that the user has access to.
 */
export async function getMembershipsForLogin(login: Login): Promise<WithId<ProjectMembership>[]> {
  if (login.project?.reference === 'Project/new') {
    return [];
  }

  if (!login.user?.reference) {
    throw new OperationOutcomeError(badRequest('User reference is missing'));
  }

  const filters: Filter[] = [
    {
      code: 'user',
      operator: Operator.EQUALS,
      value: login.user.reference,
    },
  ];

  if (login.project?.reference) {
    filters.push({
      code: 'project',
      operator: Operator.EQUALS,
      value: login.project.reference,
    });
  }

  const systemRepo = getSystemRepo();
  let memberships = await systemRepo.searchResources<ProjectMembership>({
    resourceType: 'ProjectMembership',
    count: 100,
    filters,
  });

  const profileType = login.profileType;
  if (profileType) {
    memberships = memberships.filter((m) => m.profile?.reference?.startsWith(profileType));
  }

  return memberships;
}

/**
 * Returns the project membership for the client application.
 * @param client - The client application.
 * @returns The project membership for the client application if found; otherwise undefined.
 */
export function getClientApplicationMembership(
  client: WithId<ClientApplication>
): Promise<WithId<ProjectMembership> | undefined> {
  const systemRepo = getSystemRepo();
  return systemRepo.searchOne<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [
      {
        code: 'user',
        operator: Operator.EQUALS,
        value: getReferenceString(client),
      },
    ],
  });
}

/**
 * Sets the login membership.
 * Ensures that the login satisfies the project requirements.
 * Most users will only have one membership, so this happens immediately after login.
 * Some users have multiple memberships, so this happens after choosing a profile.
 * @param login - The login before the membership is set.
 * @param membershipId - The membership to set.
 * @returns The updated login.
 */
export async function setLoginMembership(login: Login, membershipId: string): Promise<WithId<Login>> {
  if (login.revoked) {
    throw new OperationOutcomeError(badRequest('Login revoked'));
  }

  if (login.granted) {
    throw new OperationOutcomeError(badRequest('Login granted'));
  }

  if (login.membership) {
    throw new OperationOutcomeError(badRequest('Login profile already set'));
  }

  // Find the membership for the user
  const systemRepo = getSystemRepo();
  let membership = undefined;
  try {
    membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
  } catch (_err) {
    throw new OperationOutcomeError(badRequest('Profile not found'));
  }
  if (membership.user?.reference !== login.user?.reference) {
    throw new OperationOutcomeError(badRequest('Invalid profile'));
  }

  if (membership.active === false) {
    throw new OperationOutcomeError(badRequest('Profile not active'));
  }

  // Get the project
  const project = await systemRepo.readReference<Project>(membership.project as Reference<Project>);

  // Make sure the membership satisfies the project requirements
  if (project.features?.includes('google-auth-required') && login.authMethod !== 'google') {
    throw new OperationOutcomeError(badRequest('Google authentication is required'));
  }

  // TODO: Do we really need to check IP access rules inside this method?
  // Or could this be done closer to call site?
  // This method is used internally in a bunch of places that do not need to check IP access rules

  const userConfig = await getUserConfiguration(systemRepo, project, membership);

  // Get the access policy
  const accessPolicy = await getAccessPolicyForLogin({ project, login, membership, userConfig });

  // Check IP Access Rules
  await checkIpAccessRules(login, accessPolicy);

  const auditEvent = createAuditEvent(
    UserAuthenticationEvent,
    LoginEvent,
    project.id,
    membership.profile,
    login.remoteAddress,
    AuditEventOutcome.Success
  );
  logAuditEvent(auditEvent);

  // Everything checks out, update the login
  const updatedLogin: Login = {
    ...login,
    membership: createReference(membership),
  };

  if (project.superAdmin) {
    // Disable refresh tokens for super admins
    updatedLogin.refreshSecret = undefined;
  }

  return systemRepo.updateResource<Login>(updatedLogin);
}

/**
 * Checks a login against the IP Access Rules for a project.
 * Returns successfully if the login first matches an "allow" rule.
 * Returns successfully if the login does not match any rules.
 * Throws an error if the login matches a "block" rule.
 * @param login - The candidate login.
 * @param accessPolicy - The access policy for the login.
 */
export async function checkIpAccessRules(login: Login, accessPolicy: AccessPolicy | undefined): Promise<void> {
  if (!login.remoteAddress || !accessPolicy?.ipAccessRule) {
    return;
  }
  for (const rule of accessPolicy.ipAccessRule) {
    if (matchesIpAccessRule(login.remoteAddress, rule.value as string)) {
      if (rule.action === 'allow') {
        return;
      }
      if (rule.action === 'block') {
        throw new OperationOutcomeError(badRequest('IP address not allowed'));
      }
    }
  }
}

/**
 * Returns true if the remote address matches the rule value.
 * @param remoteAddress - The login remote address.
 * @param ruleValue - The IP Access Rule value.
 * @returns True if the remote address matches the rule value; otherwise false.
 */
function matchesIpAccessRule(remoteAddress: string, ruleValue: string): boolean {
  return ruleValue === '*' || ruleValue === remoteAddress || remoteAddress.startsWith(ruleValue);
}

function matchesScope(existing: SmartScope, candidate: SmartScope): boolean {
  // Ensure types match
  if (candidate.permissionType !== existing.permissionType || candidate.resourceType !== existing.resourceType) {
    return false;
  }
  // Scopes granted must be a subset
  if (
    candidate.scope.length > existing.scope.length ||
    candidate.scope.split('').some((s) => !existing.scope.includes(s))
  ) {
    return false;
  }
  if (existing.criteria && candidate.criteria !== existing.criteria) {
    return false;
  }
  return true;
}

/**
 * Sets the login scope.
 * Ensures that the scope is the same or a subset of the originally requested scope.
 * @param login - The login before the membership is set.
 * @param scope - The scope to set.
 * @returns The updated login.
 */
export async function setLoginScope(login: Login, scope: string): Promise<Login> {
  if (login.revoked) {
    throw new OperationOutcomeError(badRequest('Login revoked'));
  }
  if (login.granted) {
    throw new OperationOutcomeError(badRequest('Login granted'));
  }

  const existingScopes = parseSmartScopes(login.scope);
  const submittedScopes = parseSmartScopes(scope);

  // If user requests any scope that is not in existing scope, then reject
  for (const candidate of submittedScopes) {
    if (!existingScopes.some((existing) => matchesScope(existing, candidate))) {
      throw new OperationOutcomeError(badRequest('Invalid scope'));
    }
  }

  // Otherwise update scope
  const systemRepo = getSystemRepo();
  return systemRepo.updateResource<Login>({ ...login, scope });
}

export async function getAuthTokens(
  user: WithId<User | ClientApplication>,
  login: WithId<Login>,
  profile: Reference<ProfileResource>,
  options?: {
    accessLifetime?: string;
    refreshLifetime?: string;
  }
): Promise<TokenResult> {
  assert.equal(getReferenceString(user), login.user?.reference);

  const clientId = login.client && resolveId(login.client);

  if (!login.membership) {
    throw new OperationOutcomeError(badRequest('Login missing profile'));
  }

  if (!login.granted) {
    const systemRepo = getSystemRepo();
    await systemRepo.updateResource<Login>({
      ...login,
      granted: true,
    });
  }

  const idToken = await generateIdToken({
    client_id: clientId,
    login_id: login.id,
    fhirUser: profile.reference,
    email: login.scope?.includes('email') && user.resourceType === 'User' ? user.email : undefined,
    aud: clientId,
    sub: user.id,
    nonce: login.nonce as string,
    auth_time: (getDateProperty(login.authTime) as Date).getTime() / 1000,
  });

  const accessToken = await generateAccessToken(
    {
      client_id: clientId,
      login_id: login.id,
      sub: user.id,
      username: user.id,
      scope: login.scope as string,
      profile: profile.reference as string,
    },
    { lifetime: options?.accessLifetime }
  );

  const refreshToken = login.refreshSecret
    ? await generateRefreshToken(
        {
          client_id: clientId,
          login_id: login.id,
          refresh_secret: login.refreshSecret,
        },
        options?.refreshLifetime
      )
    : undefined;

  return {
    idToken,
    accessToken,
    refreshToken,
  };
}

export async function revokeLogin(login: Login): Promise<void> {
  const systemRepo = getSystemRepo();
  await systemRepo.updateResource<Login>({
    ...login,
    revoked: true,
  });
}

/**
 * Searches for a user by externalId and project.
 * External ID users are explicitly associated with the project.
 * @param externalId - The external ID.
 * @param projectId - The project ID.
 * @returns The user if found; otherwise, undefined.
 */
export async function getUserByExternalId(externalId: string, projectId: string): Promise<User | undefined> {
  const systemRepo = getSystemRepo();
  const membership = await systemRepo.searchOne<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [
      {
        code: 'external-id',
        operator: Operator.EXACT,
        value: externalId,
      },
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: 'Project/' + projectId,
      },
    ],
  });
  if (membership) {
    return systemRepo.readReference(membership.user as Reference<User>);
  }

  // Deprecated: Support legacy User.externalId
  return systemRepo.searchOne<User>({
    resourceType: 'User',
    filters: [
      {
        code: 'external-id',
        operator: Operator.EXACT,
        value: externalId,
      },
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: 'Project/' + projectId,
      },
    ],
  });
}

/**
 * Searches for user by email.
 * @param email - The email string.
 * @param projectId - Optional project ID.
 * @returns The user if found; otherwise, undefined.
 */
export async function getUserByEmail(email: string, projectId: string | undefined): Promise<User | undefined> {
  if (projectId && projectId !== 'new') {
    // If a project is specified, then try to find a user account only in that project.
    const userWithProject = await getUserByEmailInProject(email, projectId);
    if (userWithProject) {
      return userWithProject;
    }
  }
  return getUserByEmailWithoutProject(email);
}

/**
 * Searches for a user by email and project.
 * This will only return users that are explicitly associated with the project.
 * @param email - The email string.
 * @param projectId - The project ID.
 * @returns The user if found; otherwise, undefined.
 */
export async function getUserByEmailInProject(email: string, projectId: string): Promise<WithId<User> | undefined> {
  const systemRepo = getSystemRepo();
  const bundle = await systemRepo.search<User>({
    resourceType: 'User',
    filters: [
      {
        code: 'email',
        operator: Operator.EXACT,
        value: email.toLowerCase(),
      },
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: 'Project/' + projectId,
      },
    ],
  });
  return bundle.entry && bundle.entry.length > 0 ? bundle.entry[0].resource : undefined;
}

/**
 * Searches for a user by email without a project.
 * This returns users that are not explicitly associated with a project.
 * @param email - The email string.
 * @returns The user if found; otherwise, undefined.
 */
export async function getUserByEmailWithoutProject(email: string): Promise<WithId<User> | undefined> {
  const systemRepo = getSystemRepo();
  const bundle = await systemRepo.search<User>({
    resourceType: 'User',
    filters: [
      {
        code: 'email',
        operator: Operator.EXACT,
        value: email.toLowerCase(),
      },
      {
        code: 'project',
        operator: Operator.MISSING,
        value: 'true',
      },
    ],
  });
  return bundle.entry && bundle.entry.length > 0 ? bundle.entry[0].resource : undefined;
}

/**
 * Performs constant time comparison of two strings.
 * Returns true if a is equal to b, without leaking timing information
 * that would allow an attacker to guess one of the values.
 *
 * The built-in function timingSafeEqual requires that buffers are equal length.
 * Per the discussion here: https://github.com/nodejs/node/issues/17178
 * That is considered ok, and does not invalidate the protection from timing attack.
 * @param a - First string.
 * @param b - Second string.
 * @returns True if the strings are equal.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const buf1 = Buffer.from(a);
  const buf2 = Buffer.from(b);
  return buf1.length === buf2.length && timingSafeEqual(buf1, buf2);
}

/**
 * Determines if the login request should include a refresh token.
 * @param request - The login request.
 * @returns True if the login should include a refresh token.
 */
function includeRefreshToken(request: LoginRequest): boolean {
  // Deprecated legacy "remember" flag
  if (request.remember) {
    return true;
  }

  // Check for offline scope
  // Google calls it "offline": https://developers.google.com/identity/protocols/oauth2/web-server#offline
  // Auth0 calls it "offline_access": https://auth0.com/docs/secure/tokens/refresh-tokens/get-refresh-tokens
  // We support both
  const scopeArray = request.scope.split(' ');
  return scopeArray.includes('offline') || scopeArray.includes('offline_access');
}

/**
 * Returns the external identity provider user info for an access token.
 * This can be used to verify the access token and get the user's email address.
 * @param userInfoUrl - The user info URL from the identity provider configuration.
 * @param externalAccessToken - The external identity provider access token.
 * @param idp - Optional identity provider configuration.
 * @returns The user info claims.
 */
export async function getExternalUserInfo(
  userInfoUrl: string,
  externalAccessToken: string,
  idp?: IdentityProvider
): Promise<Record<string, unknown>> {
  const log = getLogger();
  if (!userInfoUrl.startsWith('http:') && !userInfoUrl.startsWith('https:')) {
    log.warn('Invalid user info URL', { userInfoUrl, clientId: idp?.clientId });
    throw new OperationOutcomeError(badRequest('Invalid user info URL - check your identity provider configuration'));
  }

  let response;
  try {
    response = await fetch(userInfoUrl, {
      method: 'GET',
      headers: {
        Accept: ContentType.JSON,
        Authorization: `Bearer ${externalAccessToken}`,
      },
    });
  } catch (err: any) {
    log.warn('Error while verifying external auth code', err);
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }

  if (response.status === 429) {
    log.warn('Auth rate limit exceeded', { url: userInfoUrl, clientId: idp?.clientId });
    throw new OperationOutcomeError(tooManyRequests);
  }

  if (response.status !== 200) {
    log.warn('Failed to verify external authorization code', { status: response.status });
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }

  const contentType = response.headers.get('content-type');
  try {
    if (contentType?.includes(ContentType.JSON)) {
      return await response.json();
    } else if (contentType?.includes(ContentType.JWT)) {
      return parseJWTPayload(await response.text());
    }
  } catch (err: any) {
    log.warn('Failed to verify external authorization code', err);
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }

  throw new OperationOutcomeError(badRequest(`Failed to verify code - unsupported content type: ${contentType}`));
}

interface ValidationAssertion {
  clientId?: string;
  clientSecret?: string;
  error?: string;
}
export async function verifyMultipleMatchingException(
  publicKeys: AsyncIterableIterator<any>,
  clientId: string,
  clientAssertion: string,
  verifyOptions: VerifyOptions,
  client: ClientApplication
): Promise<ValidationAssertion> {
  for await (const publicKey of publicKeys) {
    try {
      await jwtVerify(clientAssertion, publicKey, verifyOptions);
      // If we validate successfully inside the catch we can validate the client assertion
      return { clientId, clientSecret: client.secret };
    } catch (innerError: any) {
      if (innerError?.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
        continue;
      }
      return { error: innerError.code };
    }
  }
  return { error: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' };
}

/**
 * Verifies the access token and returns the corresponding login, membership, and project.
 * Handles "on behalf of" requests if the "x-medplum-on-behalf-of" header is present.
 * @param req - The incoming HTTP request.
 * @param accessToken - The access token as provided by the client.
 * @returns On success, returns the login, membership, and project. On failure, throws an error.
 */
export async function getLoginForAccessToken(
  req: Request | undefined,
  accessToken: string
): Promise<AuthState | undefined> {
  const externalAuthState = await tryExternalAuth(req, accessToken);
  if (externalAuthState) {
    return externalAuthState;
  }

  let verifyResult: Awaited<ReturnType<typeof verifyJwt>>;
  try {
    verifyResult = await verifyJwt(accessToken);
  } catch (_err) {
    return undefined;
  }

  const claims = verifyResult.payload as MedplumAccessTokenClaims;

  const systemRepo = getSystemRepo();
  let login = undefined;
  try {
    login = await systemRepo.readResource<Login>('Login', claims.login_id);
  } catch (_err) {
    return undefined;
  }

  if (!login?.membership || login.revoked) {
    return undefined;
  }

  const membership = await systemRepo.readReference<ProjectMembership>(login.membership);
  const project = await systemRepo.readReference<Project>(membership.project as Reference<Project>);
  const userConfig = await getUserConfiguration(systemRepo, project, membership);
  const authState = { login, project, membership, userConfig, accessToken };
  await tryAddOnBehalfOf(req, authState);
  return authState;
}

/**
 * Verifies the basic auth token and returns the corresponding login, membership, and project.
 * Handles "on behalf of" requests if the "x-medplum-on-behalf-of" header is present.
 * @param req - The incoming HTTP request.
 * @param token - The basic auth token as provided by the client.
 * @returns On success, returns the login, membership, and project. On failure, throws an error.
 */
export async function getLoginForBasicAuth(req: IncomingMessage, token: string): Promise<AuthState | undefined> {
  const credentials = Buffer.from(token, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  if (!username || !password) {
    return undefined;
  }

  const systemRepo = getSystemRepo();
  let client: WithId<ClientApplication>;
  try {
    client = await systemRepo.readResource<ClientApplication>('ClientApplication', username);
  } catch (_err) {
    return undefined;
  }

  if (!timingSafeEqualStr(client.secret as string, password)) {
    return undefined;
  }

  const membership = await getClientApplicationMembership(client);
  if (!membership) {
    return undefined;
  }

  const project = await systemRepo.readReference<Project>(membership.project as Reference<Project>);
  const login: Login = {
    resourceType: 'Login',
    user: createReference(client),
    authMethod: 'client',
    authTime: new Date().toISOString(),
  };
  const userConfig = await getUserConfiguration(systemRepo, project, membership);

  const authState: AuthState = { login, project, membership, userConfig };
  await tryAddOnBehalfOf(req, authState);
  return authState;
}

/**
 * Tries to add the "on behalf of" user to the auth state.
 * @param req - The incoming HTTP request.
 * @param authState - The existing auth state.
 */
async function tryAddOnBehalfOf(req: IncomingMessage | undefined, authState: AuthState): Promise<void> {
  const onBehalfOfHeader = req?.headers?.['x-medplum-on-behalf-of'];
  if (!onBehalfOfHeader || !isString(onBehalfOfHeader)) {
    return;
  }

  if (!authState.membership.admin) {
    throw new OperationOutcomeError(forbidden);
  }

  let onBehalfOfMembership: WithId<ProjectMembership> | undefined = undefined;

  const adminRepo = await getRepoForLogin(authState);

  if (onBehalfOfHeader.startsWith('ProjectMembership/')) {
    onBehalfOfMembership = await adminRepo.readReference<ProjectMembership>({ reference: onBehalfOfHeader });
  } else {
    onBehalfOfMembership = await adminRepo.searchOne({
      resourceType: 'ProjectMembership',
      filters: [
        { code: 'profile', operator: Operator.EQUALS, value: onBehalfOfHeader },
        { code: 'project', operator: Operator.EQUALS, value: getReferenceString(authState.project) },
      ],
    });
    if (!onBehalfOfMembership) {
      throw new OperationOutcomeError(forbidden);
    }
  }

  const onBehalfOf = await adminRepo.readReference(onBehalfOfMembership.profile as Reference<ProfileResource>);
  authState.onBehalfOf = onBehalfOf;
  authState.onBehalfOfMembership = onBehalfOfMembership;
}

/**
 * Tries to authenticate the user using an external authentication provider.
 * This function checks if the access token is a valid JWT and corresponds to an external authentication provider.
 * If the token is valid, it retrieves the user's profile and project membership.
 * If successful, it returns the auth state containing the login, project, membership, and user configuration.
 * If the token is invalid or does not correspond to an external provider, it returns undefined.
 *
 * @param req - The incoming HTTP request.
 * @param accessToken - The access token as provided by the client.
 * @returns The auth state if the access token is valid and corresponds to an external authentication provider; otherwise, undefined.
 */
async function tryExternalAuth(req: Request | undefined, accessToken: string): Promise<AuthState | undefined> {
  const externalAuthProviders = getConfig().externalAuthProviders;
  if (!externalAuthProviders) {
    // No external auth providers configured
    return undefined;
  }

  if (!isJwt(accessToken)) {
    // Not a JWT, so we cannot verify it
    return undefined;
  }

  const claims = parseJWTPayload(accessToken);
  const issuer = claims.iss as string;
  const externalAuthConfig = externalAuthProviders.find((provider) => provider.issuer === issuer);
  if (!externalAuthConfig) {
    // Not a configured external auth provider
    return undefined;
  }

  const systemRepo = getSystemRepo();
  const redis = getRedis();
  const redisKey = `medplum:ext-auth:${issuer}:${hashCode(accessToken)}`;
  const cachedValue = await redis.get(redisKey);
  let login: Login;
  let project: WithId<Project> | undefined;
  let membership: WithId<ProjectMembership> | undefined;

  if (cachedValue) {
    // Use cached login if available
    login = JSON.parse(cachedValue) as Login;
    membership = await systemRepo.readReference<ProjectMembership>(login.membership as Reference<ProjectMembership>);
    project = await systemRepo.readReference<Project>(membership.project as Reference<Project>);
  } else {
    // If not cached, try to authenticate the user with the external auth provider
    const externalAuthState = await tryExternalAuthLogin(req, accessToken, claims, externalAuthConfig);
    if (!externalAuthState) {
      return undefined;
    }
    ({ login, project, membership } = externalAuthState);
    await redis.set(redisKey, JSON.stringify(login), 'EX', 3600);
  }

  const userConfig = await getUserConfiguration(systemRepo, project, membership);
  return { login, project, membership, userConfig };
}

async function tryExternalAuthLogin(
  req: Request | undefined,
  accessToken: string,
  claims: JWTPayload,
  externalAuthConfig: MedplumExternalAuthConfig
): Promise<Pick<AuthState, 'login' | 'project' | 'membership'> | undefined> {
  // To ensure broad compatibility, we check for the FHIR user profile in two places:
  // the standard `fhirUser` claim and `ext.fhirUser` for identity providers
  // that automatically place custom claims in an `ext` block.
  const extensions = claims.ext as Record<string, unknown> | undefined;
  const profileString = claims.fhirUser ?? extensions?.fhirUser;
  if (!isString(profileString)) {
    return undefined;
  }

  try {
    await getExternalUserInfo(externalAuthConfig.userInfoUrl, accessToken);
  } catch (err: any) {
    getLogger().warn('Failed to get external user info', err);
    return undefined;
  }

  // Profile string can be either a reference or a search string
  let searchRequest: SearchRequest<ProfileResource>;
  if (profileString.includes('?')) {
    searchRequest = parseSearchRequest(profileString);
  } else {
    const [resourceType, id] = profileString.split('/');
    searchRequest = {
      resourceType: resourceType as ProfileResource['resourceType'],
      filters: [{ code: '_id', operator: Operator.EQUALS, value: id }],
    };
  }

  // Search for the profile
  const systemRepo = getSystemRepo();
  const profile = await systemRepo.searchOne<ProfileResource>(searchRequest);
  if (!profile) {
    return undefined;
  }

  // Search for a ProjectMembership for the profile
  const membership = await systemRepo.searchOne<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [{ code: 'profile', operator: Operator.EQUALS, value: getReferenceString(profile) }],
  });
  if (!membership || membership.active === false) {
    return undefined;
  }

  const login = await systemRepo.createResource<Login>({
    resourceType: 'Login',
    authMethod: 'external',
    project: membership.project,
    membership: createReference(membership),
    user: membership.user,
    profileType: profile.resourceType,
    authTime: new Date().toISOString(),
    scope: isString(claims.scope) ? claims.scope : undefined,
    nonce: isString(claims.nonce) ? claims.nonce : undefined,
    remoteAddress: req?.ip,
    userAgent: req?.get('User-Agent'),
  });

  const project = await systemRepo.readReference<Project>(membership.project as Reference<Project>);

  logAuditEvent(
    createAuditEvent(
      UserAuthenticationEvent,
      LoginEvent,
      project.id,
      membership.profile,
      login.remoteAddress,
      AuditEventOutcome.Success
    )
  );

  return { login, project, membership };
}

/**
 * Returns the base64-url-encoded SHA256 hash of the code.
 * The details around '+', '/', and '=' are important for compatibility.
 * See: https://auth0.com/docs/flows/call-your-api-using-the-authorization-code-flow-with-pkce
 * See: packages/client/src/crypto.ts
 * @param code - The input code.
 * @returns The base64-url-encoded SHA256 hash.
 */
export function hashCode(code: string): string {
  return createHash('sha256')
    .update(code)
    .digest()
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
