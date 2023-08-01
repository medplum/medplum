import { Command, Option } from 'commander';

export function createMedplumCommand(name: string): Command {
  return new Command(name)
    .option('--client-id <clientId>', 'FHIR server client id')
    .option('--client-secret <clientSecret>', 'FHIR server client secret')
    .option('--base-url <baseUrl>', 'FHIR server base url')
    .option('--token-url <tokenUrl>', 'FHIR server token url')
    .option('--authorize-url <authorizeUrl>', 'FHIR server authorize url')
    .option('--fhir-url-path <fhirUrlPath>', 'FHIR server url path')
    .option('--scope <scope>', 'JWT scope')
    .option('--access-token <accessToken>', 'Access token for token exchange authentication')
    .option('--callback-url <callbackUrl>', 'Callback URL for authorization code flow')
    .option('--subject <subject>', 'Subject for JWT authentication')
    .option('--audience <audience>', 'Audience for JWT authentication')
    .option('-p, --profile <name>', 'Profile name')
    .addOption(
      new Option('--auth-type <authType>', 'Type of authentication').choices([
        'basic',
        'client-credentials',
        'authorization-code',
        'jwt-bearer',
      ])
    );
}
