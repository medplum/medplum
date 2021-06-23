import { ClientApplication, createReference, Login, OperationOutcome, Operator, ProfileResource, Reference, User } from '@medplum/core';
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
  if (!request.clientId) {
    return [badRequest('Invalid clientId', 'clientId'), undefined];
  }

  if (!request.email) {
    return [badRequest('Invalid email', 'email'), undefined];
  }

  if (!request.password) {
    return [badRequest('Invalid password', 'password'), undefined];
  }

  if (!request.role) {
    return [badRequest('Invalid role', 'role'), undefined];
  }

  if (!request.scope) {
    return [badRequest('Invalid scope', 'scope'), undefined];
  }

  const [clientOutcome, client] = await repo.readResource<ClientApplication>('ClientApplication', request.clientId);
  if (!isOk(clientOutcome)) {
    return [clientOutcome, undefined];
  }

  if (!client) {
    return [notFound, undefined];
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

  let roleReference;
  switch (request.role) {
    case 'patient':
      roleReference = user.patient;
      break;

    case 'practitioner':
      roleReference = user.practitioner;
      break;

    default:
      return [badRequest('Unrecognized role', 'role'), undefined];
  }

  if (!roleReference) {
    return [badRequest('User does not have role', 'role'), undefined];
  }

  const [profileOutcome, profile] = await repo.readReference<ProfileResource>(roleReference);
  if (!isOk(profileOutcome) || !profile) {
    return [profileOutcome, undefined];
  }

  const refreshSecret = request.remember ? generateSecret() : undefined;

  return repo.createResource<Login>({
    resourceType: 'Login',
    client: {
      reference: client.resourceType + '/' + client.id,
    },
    user: {
      reference: user.resourceType + '/' + user.id
    },
    profile: createReference(profile),
    refreshSecret,
    scope: request.scope,
    nonce: request.nonce,
  });
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

  const idToken = await generateIdToken({
    client_id: clientId,
    sub: userId,
    nonce: login.nonce as string
  });

  const accessToken = await generateAccessToken({
    client_id: clientId,
    sub: userId,
    username: userId,
    scope: login.scope as string,
    profile: login.profile?.reference as string
  });

  const refreshToken = login.refreshSecret ? await generateRefreshToken({
    client_id: clientId,
    login_id: login.id as string,
    refresh_secret: login.refreshSecret as string
  }) : undefined;

  return [allOk, {
    idToken,
    accessToken,
    refreshToken
  }];
}

function getReferenceIdPart(reference: Reference | undefined): string | undefined {
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
