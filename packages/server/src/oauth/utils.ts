import {
  allOk,
  assertOk,
  badRequest,
  createReference,
  getDateProperty,
  isNotFound,
  isOk,
  notFound,
  Operator,
  ProfileResource,
  resolveId,
} from '@medplum/core';
import {
  BundleEntry,
  ClientApplication,
  Login,
  OperationOutcome,
  ProjectMembership,
  Reference,
  User,
} from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'crypto';
import { JWTPayload } from 'jose';
import { RepositoryResult, systemRepo } from '../fhir';
import { generateAccessToken, generateIdToken, generateRefreshToken, generateSecret } from './keys';

export interface LoginRequest {
  readonly email: string;
  readonly authMethod: 'password' | 'google';
  readonly password?: string;
  readonly scope: string;
  readonly nonce: string;
  readonly remember: boolean;
  readonly clientId?: string;
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

export async function tryLogin(request: LoginRequest): Promise<[OperationOutcome, Login | undefined]> {
  const validateOutcome = validateLoginRequest(request);
  if (validateOutcome) {
    return [validateOutcome, undefined];
  }

  let clientOutcome: OperationOutcome | undefined;
  let client: ClientApplication | undefined;
  if (request.clientId) {
    [clientOutcome, client] = await systemRepo.readResource<ClientApplication>('ClientApplication', request.clientId);
    if (!isOk(clientOutcome)) {
      return [clientOutcome, undefined];
    }
  }

  const [outcome, user] = await getUserByEmail(request.email);
  if (!isOk(outcome) && !isNotFound(outcome)) {
    return [outcome, undefined];
  }

  if (!user) {
    return [badRequest('Email or password is invalid'), undefined];
  }

  const authOutcome = await authenticate(request, user);
  if (!isOk(authOutcome)) {
    return [authOutcome, undefined];
  }

  const refreshSecret = request.remember ? generateSecret(48) : undefined;

  // Try to get user memberships
  // If they only have one membership, set it now
  // Otherwise the application will need to prompt the user
  const memberships = await getUserMemberships(createReference(user));

  return systemRepo.createResource<Login>({
    resourceType: 'Login',
    client: client && createReference(client),
    user: createReference(user),
    authTime: new Date().toISOString(),
    code: generateSecret(16),
    cookie: generateSecret(16),
    refreshSecret,
    scope: request.scope,
    nonce: request.nonce,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: request.codeChallengeMethod,
    admin: user.admin,
    membership: memberships.length === 1 ? createReference(memberships[0]) : undefined,
    remoteAddress: request.remoteAddress,
    userAgent: request.userAgent,
  });
}

export function validateLoginRequest(request: LoginRequest): OperationOutcome | undefined {
  if (!request.email) {
    return badRequest('Invalid email', 'email');
  }

  if (!request.authMethod) {
    return badRequest('Invalid authentication method', 'authMethod');
  }

  if (request.authMethod === 'password' && !request.password) {
    return badRequest('Invalid password', 'password');
  }

  if (request.authMethod === 'google' && !request.googleCredentials) {
    return badRequest('Invalid google credentials', 'googleCredentials');
  }

  if (!request.scope) {
    return badRequest('Invalid scope', 'scope');
  }

  if (!request.codeChallenge && request.codeChallengeMethod) {
    return badRequest('Invalid code challenge', 'code_challenge');
  }

  if (request.codeChallenge && !request.codeChallengeMethod) {
    return badRequest('Invalid code challenge method', 'code_challenge_method');
  }

  if (
    request.codeChallengeMethod &&
    request.codeChallengeMethod !== 'plain' &&
    request.codeChallengeMethod !== 'S256'
  ) {
    return badRequest('Invalid code challenge method', 'code_challenge_method');
  }

  return undefined;
}

async function authenticate(request: LoginRequest, user: User): Promise<OperationOutcome> {
  if (request.password) {
    const bcryptResult = await bcrypt.compare(request.password, user.passwordHash as string);
    if (!bcryptResult) {
      return badRequest('Email or password is invalid');
    }

    return allOk;
  }

  if (request.googleCredentials) {
    // Verify Google user id
    return allOk;
  }

  return badRequest('Invalid authentication method');
}

/**
 * Returns a list of profiles that the user has access to.
 * When a user logs in, gather all the available profiles.
 * If there is only one profile, then automatically select it.
 * Otherwise, the user must select a profile.
 * @param user Reference to the user.
 * @returns Array of profile resources that the user has access to.
 */
export async function getUserMemberships(user: Reference<ClientApplication | User>): Promise<ProjectMembership[]> {
  if (!user.reference) {
    throw new Error('User reference is missing');
  }

  const [membershipsOutcome, memberships] = await systemRepo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [
      {
        code: 'user',
        operator: Operator.EQUALS,
        value: user.reference,
      },
    ],
  });
  assertOk(membershipsOutcome, memberships);
  return (memberships.entry as BundleEntry<ProjectMembership>[]).map((entry) => entry.resource as ProjectMembership);
}

export async function getAuthTokens(
  login: Login,
  profile: Reference<ProfileResource>
): Promise<[OperationOutcome, TokenResult | undefined]> {
  const clientId = login.client && resolveId(login.client);
  const userId = resolveId(login.user);
  if (!userId) {
    return [badRequest('Login missing user'), undefined];
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

  return [
    allOk,
    {
      idToken,
      accessToken,
      refreshToken,
    },
  ];
}

export async function revokeLogin(login: Login): Promise<void> {
  systemRepo.updateResource<Login>({
    ...login,
    revoked: true,
  });
}

/**
 * Searches for user by email.
 * @param email
 * @return
 */
async function getUserByEmail(email: string): RepositoryResult<User | undefined> {
  const [outcome, bundle] = await systemRepo.search({
    resourceType: 'User',
    filters: [
      {
        code: 'email',
        operator: Operator.EQUALS,
        value: email,
      },
    ],
  });
  assertOk(outcome, bundle);

  if (!bundle.entry || bundle.entry.length === 0) {
    return [notFound, undefined];
  }

  return [allOk, bundle.entry[0].resource as User];
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
