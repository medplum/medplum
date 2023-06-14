import { MedplumClient, MedplumClientOptions } from '@medplum/core';
import { FileSystemStorage } from '../storage';

export async function createMedplumClient(options: MedplumClientOptions): Promise<MedplumClient> {
  const baseUrl = options.baseUrl ?? process.env['MEDPLUM_BASE_URL'] ?? 'https://api.medplum.com/';
  const fhirUrlPath = options.fhirUrlPath ?? process.env['MEDPLUM_FHIR_URL_PATH'] ?? '';
  const accessToken = options.accessToken ?? process.env['MEDPLUM_CLIENT_ACCESS_TOKEN'] ?? '';
  const tokenUrl = options.tokenUrl ?? process.env['MEDPLUM_TOKEN_URL'] ?? '';
  const authorizeUrl = options.authorizeUrl ?? process.env['MEDPLUM_AUTHORIZE_URL'] ?? '';
  const fetchApi = options.fetch ?? fetch;

  const medplumClient = new MedplumClient({
    fetch: fetchApi,
    baseUrl,
    tokenUrl,
    fhirUrlPath,
    authorizeUrl,
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
