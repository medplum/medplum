import { Command, Option } from 'commander';

export function createMedplumCommand(name: string): Command {
  return new Command(name)
    .option('--client-id <clientId>', 'FHIR server client id')
    .option('--client-secret <clientSecret>', 'FHIR server client secret')
    .option('--base-url <baseUrl>', 'FHIR server base URL, must be absolute')
    .option('--token-url <tokenUrl>', 'FHIR server token URL, absolute or relative to base URL')
    .option('--authorize-url <authorizeUrl>', 'FHIR server authorize URL, absolute or relative to base URL')
    .option('--fhir-url, --fhir-url-path <fhirUrlPath>', 'FHIR server URL, absolute or relative to base URL')
    .option('--scope <scope>', 'JWT scope')
    .option('--access-token <accessToken>', 'Access token for token exchange authentication')
    .option('--callback-url <callbackUrl>', 'Callback URL for authorization code flow')
    .option('--subject <subject>', 'Subject for JWT authentication')
    .option('--audience <audience>', 'Audience for JWT authentication')
    .option('--issuer <issuer>', 'Issuer for JWT authentication')
    .option('--private-key-path <privateKeyPath>', 'Private key path for JWT assertion')
    .option('-p, --profile <profile>', 'Profile name')
    .option('-v --verbose', 'Verbose output')
    .addOption(
      new Option('--auth-type <authType>', 'Type of authentication').choices([
        'basic',
        'client-credentials',
        'authorization-code',
        'jwt-bearer',
        'token-exchange',
        'jwt-assertion',
      ])
    );
}
