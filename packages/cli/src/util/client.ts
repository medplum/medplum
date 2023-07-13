import { MedplumClient, MedplumClientOptions } from '@medplum/core';
import { FileSystemStorage } from '../storage';

export async function createMedplumClient(options: MedplumClientOptions, profileName?: string): Promise<MedplumClient> {
  const profile = profileName ?? 'default';
  const storage = new FileSystemStorage(profile);
  const { baseUrl, fhirUrlPath, accessToken, tokenUrl, authorizeUrl, fetchApi } = getClientValues(options, storage);

  const medplumClient = new MedplumClient({
    fetch: fetchApi,
    baseUrl,
    tokenUrl,
    fhirUrlPath,
    authorizeUrl,
    storage,
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

function getClientValues(options: MedplumClientOptions, storage: FileSystemStorage): Record<string, any> {
  const baseUrl =
    options.baseUrl ?? storage.getString('baseUrl') ?? process.env['MEDPLUM_BASE_URL'] ?? 'https://api.medplum.com/';
  const fhirUrlPath =
    options.fhirUrlPath ?? storage.getString('fhirUrlPath') ?? process.env['MEDPLUM_FHIR_URL_PATH'] ?? '';
  const accessToken =
    options.accessToken ?? storage.getString('accessToken') ?? process.env['MEDPLUM_CLIENT_ACCESS_TOKEN'] ?? '';
  const tokenUrl = options.tokenUrl ?? storage.getString('tokenUrl') ?? process.env['MEDPLUM_TOKEN_URL'] ?? '';
  const authorizeUrl =
    options.authorizeUrl ?? storage.getString('authorizeUrl') ?? process.env['MEDPLUM_AUTHORIZE_URL'] ?? '';
  const fetchApi = options.fetch ?? fetch;

  return { baseUrl, fhirUrlPath, accessToken, tokenUrl, authorizeUrl, fetchApi };
}

export function onUnauthenticated(): void {
  console.log('Unauthenticated: run `npx medplum login` to sign in');
}
