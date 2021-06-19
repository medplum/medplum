import { ClientApplication } from '@medplum/core';
import { isOk, repo } from './fhir';
import { generateJwt } from './oauth';

export async function initTestAuth() {
  const client = await initTestClientApplication();
  const accessToken = await generateJwt('1h', {
    sub: client.id as string,
    username: client.id as string,
    client_id: client.id as string,
    profile: client.resourceType + '/' + client.id,
    scope: 'scope'
  });
  return accessToken;
}

async function initTestClientApplication(): Promise<ClientApplication> {
  const [outcome, result] = await repo.createResource({
    resourceType: 'ClientApplication',
    secret: 'big-long-string',
    redirectUri: 'https://example.com'
  } as ClientApplication);

  if (!isOk(outcome)) {
    throw new Error('Error creating application');
  }

  if (!result) {
    throw new Error('ClientApplication is null');
  }

  return result;
}
