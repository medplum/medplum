import {
  badRequest,
  createReference,
  Filter,
  getDateProperty,
  Operator,
  ProfileResource,
  resolveId,
} from '@medplum/core';
import {
  BundleEntry,
  ClientApplication,
  Login,
  Project,
  ProjectMembership,
  Reference,
  SmartAppLaunch,
  User,
} from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'crypto';
import { JWTPayload } from 'jose';
import { systemRepo } from '../fhir/repo';
import { AuditEventOutcome, logAuthEvent, LoginEvent } from '../util/auditevent';
import { generateAccessToken, generateIdToken, generateRefreshToken, generateSecret } from './keys';

export interface LoginRequest {
  readonly email: string;
  readonly authMethod: 'password' | 'google';
  readonly password?: string;
  readonly scope: string;
  readonly nonce: string;
  readonly remember: boolean;
  readonly resourceType?: string;
  readonly projectId?: string;
  readonly clientId?: string;
  readonly launchId?: string;
  readonly codeChallenge?: string;
  readonly codeChallengeMethod?: string;
  readonly googleCredentials?: GoogleCredentialClaims;
  readonly remoteAddress?: string;
  readonly userAgent?: string;
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

export async function tryLogin(request: LoginRequest): Promise<Login> {
  validateLoginRequest(request);

  let client: ClientApplication | undefined;
  if (request.clientId) {
    client = await systemRepo.readResource<ClientApplication>('ClientApplication', request.clientId);
  }

  let launch: SmartAppLaunch | undefined;
  if (request.launchId) {
    launch = await systemRepo.readResource<SmartAppLaunch>('SmartAppLaunch', request.launchId);
  }

  const user = await getUserByEmail(request.email, request.projectId);
  if (!user) {
    throw badRequest('Email or password is invalid');
  }

  await authenticate(request, user);

  const refreshSecret = request.remember ? generateSecret(32) : undefined;

  const login = await systemRepo.createResource<Login>({
    resourceType: 'Login',
    client: client && createReference(client),
    launch: launch && createReference(launch),
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
  const memberships = await getUserMemberships(createReference(user), request.projectId, request.resourceType);
  if (memberships.length === 1) {
    return setLoginMembership(login, memberships[0].id as string);
  } else {
    return login;
  }
}

export function validateLoginRequest(request: LoginRequest): void {
  if (!request.email) {
    throw badRequest('Invalid email', 'email');
  }

  if (!request.authMethod) {
    throw badRequest('Invalid authentication method', 'authMethod');
  }

  if (request.authMethod === 'password' && !request.password) {
    throw badRequest('Invalid password', 'password');
  }

  if (request.authMethod === 'google' && !request.googleCredentials) {
    throw badRequest('Invalid google credentials', 'googleCredentials');
  }

  if (!request.scope) {
    throw badRequest('Invalid scope', 'scope');
  }

  if (!request.codeChallenge && request.codeChallengeMethod) {
    throw badRequest('Invalid code challenge', 'code_challenge');
  }

  if (request.codeChallenge && !request.codeChallengeMethod) {
    throw badRequest('Invalid code challenge method', 'code_challenge_method');
  }

  if (
    request.codeChallengeMethod &&
    request.codeChallengeMethod !== 'plain' &&
    request.codeChallengeMethod !== 'S256'
  ) {
    throw badRequest('Invalid code challenge method', 'code_challenge_method');
  }

  return undefined;
}

async function authenticate(request: LoginRequest, user: User): Promise<void> {
  if (request.password && user.passwordHash) {
    const bcryptResult = await bcrypt.compare(request.password, user.passwordHash as string);
    if (!bcryptResult) {
      throw badRequest('Email or password is invalid');
    }
    return;
  }

  if (request.googleCredentials) {
    // Verify Google user id
    return;
  }

  throw badRequest('Invalid authentication method');
}

/**
 * Returns a list of profiles that the user has access to.
 * When a user logs in, gather all the available profiles.
 * If there is only one profile, then automatically select it.
 * Otherwise, the user must select a profile.
 * @param user Reference to the user.
 * @param projectId Optional project ID.
 * @returns Array of profile resources that the user has access to.
 */
export async function getUserMemberships(
  user: Reference<ClientApplication | User>,
  projectId?: string,
  resourceType?: string
): Promise<ProjectMembership[]> {
  if (projectId === 'new') {
    return [];
  }

  if (!user.reference) {
    throw new Error('User reference is missing');
  }

  const filters: Filter[] = [
    {
      code: 'user',
      operator: Operator.EQUALS,
      value: user.reference,
    },
  ];

  if (projectId) {
    filters.push({
      code: 'project',
      operator: Operator.EQUALS,
      value: 'Project/' + projectId,
    });
  }

  const bundle = await systemRepo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    count: 100,
    filters,
  });

  let memberships = (bundle.entry as BundleEntry<ProjectMembership>[]).map((e) => e.resource as ProjectMembership);

  if (resourceType) {
    memberships = memberships.filter((m) => m.profile?.reference?.startsWith(resourceType));
  }

  return memberships;
}

/**
 * Sets the login membership.
 * Ensures that the login satisfies the project requirements.
 * Most users will only have one membership, so this happens immediately after login.
 * Some users have multiple memberships, so this happens after choosing a profile.
 * @param login The login before the membership is set.
 * @param membershipId The membership to set.
 * @returns The updated login.
 */
export async function setLoginMembership(login: Login, membershipId: string): Promise<Login> {
  if (login.revoked) {
    throw badRequest('Login revoked');
  }

  if (login.granted) {
    throw badRequest('Login granted');
  }

  if (login.membership) {
    throw badRequest('Login profile already set');
  }

  // Find the membership for the user
  let membership = undefined;
  try {
    membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
  } catch (err) {
    throw badRequest('Profile not found');
  }
  if (membership.user?.reference !== login.user?.reference) {
    throw badRequest('Invalid profile');
  }

  // Get the project
  const project = await systemRepo.readReference<Project>(membership.project as Reference<Project>);

  // Make sure the membership satisfies the project requirements
  if (project.features?.includes('google-auth-required') && login.authMethod !== 'google') {
    throw badRequest('Google authentication is required');
  }

  logAuthEvent(LoginEvent, project.id as string, membership.profile, login.remoteAddress, AuditEventOutcome.Success);

  // Everything checks out, update the login
  return systemRepo.updateResource<Login>({
    ...login,
    membership: createReference(membership),
    superAdmin: project.superAdmin,
  });
}

/**
 * Sets the login scope.
 * Ensures that the scope is the same or a subset of the originally requested scope.
 * @param login The login before the membership is set.
 * @param scope The scope to set.
 * @returns The updated login.
 */
export async function setLoginScope(login: Login, scope: string): Promise<Login> {
  if (login.revoked) {
    throw badRequest('Login revoked');
  }

  if (login.granted) {
    throw badRequest('Login granted');
  }

  // Get existing scope
  const existingScopes = login.scope?.split(' ') || [];

  // Get submitted scope
  const submittedScopes = scope.split(' ');

  // If user requests any scope that is not in existing scope, then reject
  for (const scope of submittedScopes) {
    if (!existingScopes.includes(scope)) {
      throw badRequest('Invalid scope');
    }
  }

  // Otherwise update scope
  return systemRepo.updateResource<Login>({
    ...login,
    scope: submittedScopes.join(' '),
  });
}

export async function getAuthTokens(login: Login, profile: Reference<ProfileResource>): Promise<TokenResult> {
  const clientId = login.client && resolveId(login.client);
  const userId = resolveId(login.user);
  if (!userId) {
    throw badRequest('Login missing user');
  }

  if (!login.membership) {
    throw badRequest('Login missing profile');
  }

  if (!login.granted) {
    await systemRepo.updateResource<Login>({
      ...login,
      granted: true,
    });
  }

  const idToken = await generateIdToken({
    client_id: clientId,
    login_id: login.id as string,
    fhirUser: profile.reference,
    aud: clientId,
    sub: userId,
    nonce: login.nonce as string,
    auth_time: (getDateProperty(login.authTime) as Date).getTime() / 1000,
  });

  const accessToken = await generateAccessToken({
    client_id: clientId,
    login_id: login.id as string,
    sub: userId,
    username: userId,
    scope: login.scope as string,
    profile: profile.reference as string,
  });

  const refreshToken = login.refreshSecret
    ? await generateRefreshToken({
        client_id: clientId,
        login_id: login.id as string,
        refresh_secret: login.refreshSecret,
      })
    : undefined;

  return {
    idToken,
    accessToken,
    refreshToken,
  };
}

export async function revokeLogin(login: Login): Promise<void> {
  await systemRepo.updateResource<Login>({
    ...login,
    revoked: true,
  });
}

/**
 * Searches for user by email.
 * @param email The email string.
 * @param projectId Optional project ID.
 * @return The user if found; otherwise, undefined.
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
 * @param email The email string.
 * @param projectId The project ID.
 * @returns The user if found; otherwise, undefined.
 */
export async function getUserByEmailInProject(email: string, projectId: string): Promise<User | undefined> {
  const bundle = await systemRepo.search({
    resourceType: 'User',
    filters: [
      {
        code: 'email',
        operator: Operator.EQUALS,
        value: email,
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
 * @param email The email string.
 * @returns The user if found; otherwise, undefined.
 */
export async function getUserByEmailWithoutProject(email: string): Promise<User | undefined> {
  const bundle = await systemRepo.search({
    resourceType: 'User',
    filters: [
      {
        code: 'email',
        operator: Operator.EQUALS,
        value: email,
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
 *
 * @param a First string.
 * @param b Second string.
 * @returns True if the strings are equal.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const buf1 = Buffer.from(a);
  const buf2 = Buffer.from(b);
  return buf1.length === buf2.length && timingSafeEqual(buf1, buf2);
}
