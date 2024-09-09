import {
  badRequest,
  ContentType,
  createReference,
  Filter,
  getDateProperty,
  getReferenceString,
  MEDPLUM_CLI_CLIENT_ID,
  OperationOutcomeError,
  Operator,
  ProfileResource,
  resolveId,
  tooManyRequests,
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
import { JWTPayload, jwtVerify, VerifyOptions } from 'jose';
import fetch from 'node-fetch';
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { authenticator } from 'otplib';
import { getRequestContext } from '../context';
import { getAccessPolicyForLogin } from '../fhir/accesspolicy';
import { getSystemRepo } from '../fhir/repo';
import { AuditEventOutcome, logAuthEvent, LoginEvent } from '../util/auditevent';
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
  if (clientId === MEDPLUM_CLI_CLIENT_ID) {
    return {
      resourceType: 'ClientApplication',
      id: MEDPLUM_CLI_CLIENT_ID,
      redirectUri: 'http://localhost:9615',
      pkceOptional: true,
    };
  }
  const systemRepo = getSystemRepo();
  return systemRepo.readResource<ClientApplication>('ClientApplication', clientId);
}

export async function tryLogin(request: LoginRequest): Promise<Login> {
  validateLoginRequest(request);

  let client: ClientApplication | undefined;
  if (request.clientId) {
    client = await getClientApplication(request.clientId);
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
    return setLoginMembership(login, memberships[0].id as string);
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
export async function getMembershipsForLogin(login: Login): Promise<ProjectMembership[]> {
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
export function getClientApplicationMembership(client: ClientApplication): Promise<ProjectMembership | undefined> {
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
export async function setLoginMembership(login: Login, membershipId: string): Promise<Login> {
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

  // Get the project
  const project = await systemRepo.readReference<Project>(membership.project as Reference<Project>);

  // Make sure the membership satisfies the project requirements
  if (project.features?.includes('google-auth-required') && login.authMethod !== 'google') {
    throw new OperationOutcomeError(badRequest('Google authentication is required'));
  }

  // TODO: Do we really need to check IP access rules inside this method?
  // Or could this be done closer to call site?
  // This method is used internally in a bunch of places that do not need to check IP access rules

  // Get the access policy
  const accessPolicy = await getAccessPolicyForLogin({ project, login, membership });

  // Check IP Access Rules
  await checkIpAccessRules(login, accessPolicy);

  logAuthEvent(LoginEvent, project.id as string, membership.profile, login.remoteAddress, AuditEventOutcome.Success);

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

  // Get existing scope
  const existingScopes = login.scope?.split(' ') || [];

  // Get submitted scope
  const submittedScopes = scope.split(' ');

  // If user requests any scope that is not in existing scope, then reject
  for (const scope of submittedScopes) {
    if (!existingScopes.includes(scope)) {
      throw new OperationOutcomeError(badRequest('Invalid scope'));
    }
  }

  // Otherwise update scope
  const systemRepo = getSystemRepo();
  return systemRepo.updateResource<Login>({
    ...login,
    scope: submittedScopes.join(' '),
  });
}

export async function getAuthTokens(
  user: User | ClientApplication,
  login: Login,
  profile: Reference<ProfileResource>,
  refreshLifetime?: string
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
    login_id: login.id as string,
    fhirUser: profile.reference,
    email: login.scope?.includes('email') && user.resourceType === 'User' ? user.email : undefined,
    aud: clientId,
    sub: user.id,
    nonce: login.nonce as string,
    auth_time: (getDateProperty(login.authTime) as Date).getTime() / 1000,
  });

  const accessToken = await generateAccessToken({
    client_id: clientId,
    login_id: login.id as string,
    sub: user.id,
    username: user.id as string,
    scope: login.scope as string,
    profile: profile.reference as string,
  });

  const refreshToken = login.refreshSecret
    ? await generateRefreshToken(
        {
          client_id: clientId,
          login_id: login.id as string,
          refresh_secret: login.refreshSecret,
        },
        refreshLifetime
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
export async function getUserByEmailInProject(email: string, projectId: string): Promise<User | undefined> {
  const systemRepo = getSystemRepo();
  const bundle = await systemRepo.search({
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
  return bundle.entry && bundle.entry.length > 0 ? (bundle.entry[0].resource as User) : undefined;
}

/**
 * Searches for a user by email without a project.
 * This returns users that are not explicitly associated with a project.
 * @param email - The email string.
 * @returns The user if found; otherwise, undefined.
 */
export async function getUserByEmailWithoutProject(email: string): Promise<User | undefined> {
  const systemRepo = getSystemRepo();
  const bundle = await systemRepo.search({
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
  return bundle.entry && bundle.entry.length > 0 ? (bundle.entry[0].resource as User) : undefined;
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
 * @param idp - The identity provider configuration.
 * @param externalAccessToken - The external identity provider access token.
 * @returns The user info claims.
 */
export async function getExternalUserInfo(
  idp: IdentityProvider,
  externalAccessToken: string
): Promise<Record<string, unknown>> {
  const ctx = getRequestContext();
  let response;
  try {
    response = await fetch(idp.userInfoUrl as string, {
      method: 'GET',
      headers: {
        Accept: ContentType.JSON,
        Authorization: `Bearer ${externalAccessToken}`,
      },
    });
  } catch (err: any) {
    ctx.logger.warn('Error while verifying external auth code', err);
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }

  if (response.status === 429) {
    ctx.logger.warn('Auth rate limit exceeded', { url: idp.userInfoUrl, clientId: idp.clientId });
    throw new OperationOutcomeError(tooManyRequests);
  }

  if (response.status !== 200) {
    ctx.logger.warn('Failed to verify external authorization code', { status: response.status });
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }

  // Make sure content type is json
  if (!response.headers.get('content-type')?.includes(ContentType.JSON)) {
    let text = '';
    try {
      text = await response.text();
    } catch (err: any) {
      ctx.logger.debug('Failed to get response text', err);
    }
    ctx.logger.warn('Failed to verify external authorization code, non-JSON response', { text });
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }

  try {
    return await response.json();
  } catch (err: any) {
    ctx.logger.warn('Failed to verify external authorization code', err);
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }
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
 * @param accessToken - The access token as provided by the client.
 * @returns On success, returns the login, membership, and project. On failure, throws an error.
 */
export async function getLoginForAccessToken(accessToken: string): Promise<AuthState | undefined> {
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
  return { login, membership, project, accessToken };
}
