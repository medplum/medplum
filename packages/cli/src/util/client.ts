import { MedplumClient, MedplumClientOptions } from '@medplum/core';
import { FileSystemStorage } from '../storage';

export async function createMedplumClient(options: MedplumClientOptions, profileName?: string): Promise<MedplumClient> {
  const profile = profileName ?? 'default';
  const storage = new FileSystemStorage(profile);
  const { baseUrl, fhirUrlPath, accessToken, tokenUrl, authorizeUrl, fetchApi, clientId, clientSecret } =
    getClientValues(options, storage);

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

  if (clientId && clientSecret) {
    medplumClient.setBasicAuth(clientId, clientSecret);
    await medplumClient.startClientLogin(clientId, clientSecret);
  }
  return medplumClient;
}

function getClientValues(options: MedplumClientOptions, storage: FileSystemStorage): Record<string, any> {
  const storageOptions: any = storage.getObject('options');
  const baseUrl =
    options.baseUrl ?? storageOptions?.baseUrl ?? process.env['MEDPLUM_BASE_URL'] ?? 'https://api.medplum.com/';
  const fhirUrlPath = options.fhirUrlPath ?? storageOptions?.fhirUrlPath ?? process.env['MEDPLUM_FHIR_URL_PATH'] ?? '';
  const accessToken =
    options.accessToken ?? storageOptions?.accessToken ?? process.env['MEDPLUM_CLIENT_ACCESS_TOKEN'] ?? '';
  const tokenUrl = options.tokenUrl ?? storageOptions?.tokenUrl ?? process.env['MEDPLUM_TOKEN_URL'] ?? '';
  const authorizeUrl =
    options.authorizeUrl ?? storageOptions?.authorizeUrl ?? process.env['MEDPLUM_AUTHORIZE_URL'] ?? '';

  const fetchApi = options.fetch ?? fetch;

  const clientId = options.clientId ?? storageOptions?.clientId ?? process.env['MEDPLUM_CLIENT_ID'];
  const clientSecret = options.clientSecret ?? storageOptions?.clientSecret ?? process.env['MEDPLUM_CLIENT_SECRET'];

  return { baseUrl, fhirUrlPath, accessToken, tokenUrl, authorizeUrl, fetchApi, clientId, clientSecret };
}

export function onUnauthenticated(): void {
  console.log('Unauthenticated: run `npx medplum login` to sign in');
}
