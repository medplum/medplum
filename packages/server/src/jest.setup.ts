import { createReference, isOk, Login } from '@medplum/core';
import { repo } from './fhir';
import { generateAccessToken } from './oauth';
import { getDefaultClientApplication } from './seed';

export async function initTestAuth() {
  const client = getDefaultClientApplication();
  const scope = 'openid';

  const [loginOutcome, login] = await repo.createResource<Login>({
    resourceType: 'Login',
    client: createReference(client),
    profile: createReference(client),
    authTime: new Date().toISOString(),
    scope
  });

  if (!isOk(loginOutcome) || !login) {
    throw new Error('Error creating login');
  }

  return generateAccessToken({
    login_id: login.id as string,
    sub: client.id as string,
    username: client.id as string,
    client_id: client.id as string,
    profile: client.resourceType + '/' + client.id,
    scope
  });
}
