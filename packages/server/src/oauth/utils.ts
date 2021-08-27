import { allOk, assertOk, badRequest, ClientApplication, createReference, getDateProperty, getReferenceString, isNotFound, isOk, Login, notFound, OperationOutcome, Operator, ProfileResource, ProjectMembership, Reference, Resource, User } from '@medplum/core';
import bcrypt from 'bcrypt';
import { JWTPayload } from 'jose/webcrypto/types';
import { PUBLIC_PROJECT_ID } from '../constants';
import { repo, RepositoryResult } from '../fhir';
import { generateAccessToken, generateIdToken, generateRefreshToken, generateSecret } from './keys';

export interface LoginRequest {
  readonly clientId: string;
  readonly email: string;
  readonly authMethod: 'password' | 'google';
  readonly password?: string;
  readonly role: 'practitioner' | 'patient';
  readonly scope: string;
  readonly nonce: string;
  readonly remember: boolean;
  readonly codeChallenge?: string;
  readonly codeChallengeMethod?: string;
  readonly googleCredentials?: GoogleCredentialClaims;
}

export interface TokenResult {
  readonly idToken: string;
  readonly accessToken: string;
  readonly refreshToken?: string;
}

export interface LoginResult {
  readonly tokens: TokenResult;
  readonly user: User;
  readonly profile: Resource;
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

  const [clientOutcome, client] = await repo.readResource<ClientApplication>('ClientApplication', request.clientId);
  if (!isOk(clientOutcome)) {
    return [clientOutcome, undefined];
  }

  const [outcome, user] = await getUserByEmail(request.email);
  if (!isOk(outcome) && !isNotFound(outcome)) {
    return [outcome, undefined];
  }

  if (!user) {
    return [badRequest('User not found', 'email'), undefined];
  }

  const authOutcome = await authenticate(request, user);
  if (!isOk(authOutcome)) {
    return [authOutcome, undefined];
  }

  const memberships = await getUserMemberships(user);
  if (!memberships || memberships.length === 0) {
    return [badRequest('Project memberships not found', 'email'), undefined];
  }

  const compartments = user.admin ? [] : getCompartments(memberships);
  const project = getDefaultProject(memberships);
  const profile = getDefaultProfile(memberships);
  const refreshSecret = request.remember ? generateSecret(48) : undefined;

  return repo.createResource<Login>({
    resourceType: 'Login',
    client: createReference(client as ClientApplication),
    user: createReference(user),
    profile,
    defaultProject: project,
    compartments,
    authTime: new Date(),
    code: generateSecret(16),
    cookie: generateSecret(16),
    refreshSecret,
    scope: request.scope,
    nonce: request.nonce,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: request.codeChallengeMethod,
  });
}

export function validateLoginRequest(request: LoginRequest): OperationOutcome | undefined {
  if (!request.clientId) {
    return badRequest('Invalid clientId', 'clientId');
  }

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
    return badRequest('Invalid password', 'password');
  }

  if (request.role !== 'patient' && request.role !== 'practitioner') {
    return badRequest('Invalid role', 'role');
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

  if (request.codeChallengeMethod &&
    request.codeChallengeMethod !== 'plain' &&
    request.codeChallengeMethod !== 'S256') {
    return badRequest('Invalid code challenge method', 'code_challenge_method');
  }

  return undefined;
}

export async function authenticate(request: LoginRequest, user: User): Promise<OperationOutcome> {
  if (request.password) {
    const passwordHash = user?.passwordHash;
    if (!passwordHash) {
      return badRequest('Invalid user', 'email');
    }

    const bcryptResult = await bcrypt.compare(request.password, passwordHash);
    if (!bcryptResult) {
      return badRequest('Incorrect password', 'password');
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
 * Performs common additional login steps.
 * Each of the common login paths (signin, register, google auth) perform a similar
 * series of post-login steps for the client.
 * Note that this *cannot* be part of tryLogin directly, because tokens cannot be issued in that step.
 * In OAuth2 authorization code flow, "login" and "token" must be two separate requests.
 * @param login The login resource.
 * @returns Additional common login artifacts.
 */
export async function finalizeLogin(login: Login): Promise<LoginResult> {
  const [tokensOutcome, tokens] = await getAuthTokens(login);
  assertOk(tokensOutcome);

  const [userOutcome, user] = await repo.readReference<User>(login?.user as Reference);
  assertOk(userOutcome);

  const [profileOutcome, profile] = await repo.readReference<ProfileResource>(login?.profile as Reference);
  assertOk(profileOutcome);

  return {
    tokens: tokens as TokenResult,
    user: user as User,
    profile: profile as ProfileResource
  };
}

export async function getAuthTokens(login: Login): Promise<[OperationOutcome, TokenResult | undefined]> {
  const clientId = getReferenceIdPart(login.client);
  if (!clientId) {
    return [badRequest('Login missing client'), undefined];
  }

  const userId = getReferenceIdPart(login.user);
  if (!userId) {
    return [badRequest('Login missing user'), undefined];
  }

  if (!login.granted) {
    await repo.updateResource<Login>({
      ...login,
      granted: true
    });
  }

  const idToken = await generateIdToken({
    client_id: clientId,
    login_id: login.id as string,
    sub: userId,
    nonce: login.nonce as string,
    auth_time: (getDateProperty(login.authTime) as Date).getTime() / 1000
  });

  const accessToken = await generateAccessToken({
    client_id: clientId,
    login_id: login.id as string,
    sub: userId,
    username: userId,
    scope: login.scope as string,
    profile: login.profile?.reference as string
  });

  const refreshToken = login.refreshSecret ? await generateRefreshToken({
    client_id: clientId,
    login_id: login.id as string,
    refresh_secret: login.refreshSecret
  }) : undefined;

  return [allOk, {
    idToken,
    accessToken,
    refreshToken
  }];
}

export async function revokeLogin(login: Login): Promise<void> {
  repo.updateResource<Login>({
    ...login,
    revoked: true
  });
}

/**
 * Returns the ID portion of a FHIR reference.
 * @param reference A reference object.
 * @returns The resource ID portion of the reference.
 */
export function getReferenceIdPart(reference: Reference | undefined): string | undefined {
  const str = reference?.reference;
  if (!str) {
    return undefined;
  }
  return str.split('/')[1];
}

/**
 * Searches for user by email.
 * @param email
 * @return
 */
async function getUserByEmail(email: string): RepositoryResult<User | undefined> {
  const [outcome, bundle] = await repo.search({
    resourceType: 'User',
    filters: [{
      code: 'email',
      operator: Operator.EQUALS,
      value: email
    }]
  });

  if (!isOk(outcome)) {
    return [outcome, undefined];
  }

  if (!bundle?.entry || bundle.entry.length === 0) {
    return [notFound, undefined];
  }

  return [allOk, bundle.entry[0].resource as User];
}

async function getUserMemberships(user: User): Promise<ProjectMembership[] | undefined> {
  // In the future, introduce new login step for user to choose project and profile
  // For now, support the common case of one project per user
  const [membershipsOutcome, memberships] = await repo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [{
      code: 'user',
      operator: Operator.EQUALS,
      value: getReferenceString(user)
    }]
  });

  assertOk(membershipsOutcome);
  return memberships?.entry?.map(entry => entry.resource as ProjectMembership);
}

function getCompartments(memberships: ProjectMembership[]): Reference[] {
  const compartments: Reference[] = [{
    reference: 'Project/' + PUBLIC_PROJECT_ID
  }];

  for (const membership of memberships) {
    if (membership.compartments) {
      compartments.push(...membership.compartments);
    }
  }

  return compartments;
}

function getDefaultProfile(memberships: ProjectMembership[]): Reference | undefined {
  for (const membership of memberships) {
    if (membership.profile) {
      return membership.profile;
    }
  }
  return undefined;
}

function getDefaultProject(memberships: ProjectMembership[]): Reference | undefined {
  for (const membership of memberships) {
    if (membership.project) {
      return membership.project;
    }
  }
  return undefined;
}
