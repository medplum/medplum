import { getDateProperty, ClientApplication, createReference, Login, OperationOutcome, Operator, ProfileResource, Reference, User } from '@medplum/core';
import bcrypt from 'bcrypt';
import { allOk, badRequest, isNotFound, isOk, notFound, repo, RepositoryResult } from '../fhir';
import { generateAccessToken, generateIdToken, generateRefreshToken, generateSecret } from './keys';

export interface LoginRequest {
  clientId: string;
  email: string;
  password: string;
  role: 'practitioner' | 'patient';
  scope: string;
  nonce: string;
  remember: boolean;
}

export interface TokenResult {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
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

  const passwordHash = user?.passwordHash;
  if (!passwordHash) {
    return [badRequest('Invalid user', 'email'), undefined];
  }

  const bcryptResult = await bcrypt.compare(request.password, passwordHash);
  if (!bcryptResult) {
    return [badRequest('Incorrect password', 'password'), undefined];
  }

  const roleReference = request.role === 'patient' ? user.patient : user.practitioner;
  if (!roleReference) {
    return [badRequest('User does not have role', 'role'), undefined];
  }

  const [profileOutcome, profile] = await repo.readReference<ProfileResource>(roleReference);
  if (!isOk(profileOutcome) || !profile) {
    return [profileOutcome, undefined];
  }

  const refreshSecret = request.remember ? generateSecret(48) : undefined;

  return repo.createResource<Login>({
    resourceType: 'Login',
    client: createReference(client as ClientApplication),
    user: createReference(user),
    profile: createReference(profile),
    authTime: new Date(),
    code: generateSecret(16),
    cookie: generateSecret(16),
    refreshSecret,
    scope: request.scope,
    nonce: request.nonce,
  });
}

function validateLoginRequest(request: LoginRequest): OperationOutcome | undefined {
  if (!request.clientId) {
    return badRequest('Invalid clientId', 'clientId');
  }

  if (!request.email) {
    return badRequest('Invalid email', 'email');
  }

  if (!request.password) {
    return badRequest('Invalid password', 'password');
  }

  if (request.role !== 'patient' && request.role !== 'practitioner') {
    return badRequest('Invalid role', 'role');
  }

  if (!request.scope) {
    return badRequest('Invalid scope', 'scope');
  }

  return undefined;
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
