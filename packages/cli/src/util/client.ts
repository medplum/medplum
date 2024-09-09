import { MedplumClient, MedplumClientOptions } from '@medplum/core';
import { FileSystemStorage } from '../storage';
import { Profile } from '../utils';

export async function createMedplumClient(
  options: MedplumClientOptions & { profile?: string },
  setupCredentials = true
): Promise<MedplumClient> {
  const profileName = options.profile ?? 'default';

  const storage = new FileSystemStorage(profileName);
  const profile = storage.getObject('options') as Profile;
  if (profileName !== 'default' && !profile) {
    throw new Error(`Profile "${profileName}" does not exist`);
  }

  const { baseUrl, fhirUrlPath, accessToken, tokenUrl, authorizeUrl, clientId, clientSecret } = getClientValues(
    options,
    storage
  );
  const fetchApi = options.fetch ?? fetch;
  const medplumClient = new MedplumClient({
    fetch: fetchApi,
    baseUrl,
    tokenUrl,
    fhirUrlPath,
    authorizeUrl,
    storage,
    onUnauthenticated,
    verbose: options.verbose,
  });

  // In most commands, we want to automatically set up credentials.
  // However, in some cases such as "login", we don't want to do that.
  // Setup credentials if the user does not explicitly disable it.
  if (setupCredentials) {
    if (accessToken) {
      // If the access token is provided, use it.
      medplumClient.setAccessToken(accessToken);
    } else if (clientId && clientSecret) {
      // If the client ID and secret are provided, use them.
      medplumClient.setBasicAuth(clientId as string, clientSecret as string);
      if (profile?.authType !== 'basic') {
        // Unless the user explicitly specified basic auth, start the client login.
        await medplumClient.startClientLogin(clientId as string, clientSecret as string);
      }
    }
  }

  return medplumClient;
}

function getClientValues(options: MedplumClientOptions, storage: FileSystemStorage): MedplumClientOptions {
  const storageOptions = storage.getObject('options') as MedplumClientOptions;
  const baseUrl =
    options.baseUrl ?? storageOptions?.baseUrl ?? process.env['MEDPLUM_BASE_URL'] ?? 'https://api.medplum.com/';
  const fhirUrlPath = options.fhirUrlPath ?? storageOptions?.fhirUrlPath ?? process.env['MEDPLUM_FHIR_URL_PATH'];
  const accessToken = options.accessToken ?? storageOptions?.accessToken ?? process.env['MEDPLUM_CLIENT_ACCESS_TOKEN'];
  const tokenUrl = options.tokenUrl ?? storageOptions?.tokenUrl ?? process.env['MEDPLUM_TOKEN_URL'];
  const authorizeUrl = options.authorizeUrl ?? storageOptions?.authorizeUrl ?? process.env['MEDPLUM_AUTHORIZE_URL'];

  const clientId = options.clientId ?? storageOptions?.clientId ?? process.env['MEDPLUM_CLIENT_ID'];
  const clientSecret = options.clientSecret ?? storageOptions?.clientSecret ?? process.env['MEDPLUM_CLIENT_SECRET'];

  return { baseUrl, fhirUrlPath, accessToken, tokenUrl, authorizeUrl, clientId, clientSecret };
}

export function onUnauthenticated(): void {
  console.log('Unauthenticated: run `npx medplum login` to sign in');
}
