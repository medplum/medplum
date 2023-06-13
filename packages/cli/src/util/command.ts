import { Command } from 'commander';

export function createMedplumCommand(name: string): Command {
  return new Command(name)
    .option('--client-id <clientId>', 'FHIR server client id')
    .option('--client-secret <clientSecret>', 'FHIR server client secret')
    .option('--base-url <baseUrl>', 'FHIR server base url')
    .option('--token-url <tokenUrl>', 'FHIR server token url')
    .option('--fhir-url-path <fhirUrlPath>', 'FHIR server url path');
}
