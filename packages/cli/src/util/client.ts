import { FetchLike, MedplumClient } from '@medplum/core';
import { FileSystemStorage } from '../storage';

export interface MedplumClientCommandOptions {
  fetch?: FetchLike;
  baseUrl?: string;
  fhirUrlPath?: string;
  accessToken?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
}

export async function createMedplumClient(options: MedplumClientCommandOptions): Promise<MedplumClient> {
  const baseUrl = options.baseUrl || process.env['MEDPLUM_BASE_URL'] || 'https://api.medplum.com/';
  const fhirUrlPath = options.fhirUrlPath || process.env['MEDPLUM_FHIR_URL_PATH'] || '';
  const accessToken = options.accessToken || process.env['MEDPLUM_CLIENT_ACCESS_TOKEN'] || '';
  const tokenUrl = options.tokenUrl || process.env['MEDPLUM_TOKEN_URL'] || '';
  const fetchApi = options.fetch || fetch;

  const medplumClient = new MedplumClient({
    fetch: fetchApi,
    baseUrl,
    tokenUrl,
    fhirUrlPath,
    storage: new FileSystemStorage(),
    onUnauthenticated: onUnauthenticated,
  });

  if (accessToken) {
    medplumClient.setAccessToken(accessToken);
  }

  const clientId = options.clientId || process.env['MEDPLUM_CLIENT_ID'];
  const clientSecret = options.clientSecret || process.env['MEDPLUM_CLIENT_SECRET'];

  if (clientId && clientSecret) {
    medplumClient.setBasicAuth(clientId, clientSecret);
    await medplumClient.startClientLogin(clientId, clientSecret);
  }
  return medplumClient;
}

export function onUnauthenticated(): void {
  console.log('Unauthenticated: run `npx medplum login` to sign in');
}
