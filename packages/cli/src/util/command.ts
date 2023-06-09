import { Command } from 'commander';

class MedplumCommand extends Command {
  createCommand(name: string | undefined): Command {
    const cmd = new Command(name);

    // global options
    cmd.option('--client-id <clientId>', 'FHIR server client id');
    cmd.option('--client-secret <clientSecret>', 'FHIR server client secret');
    cmd.option('--base-url <baseUrl>', 'FHIR server base url');
    cmd.option('--token-url <tokenUrl>', 'FHIR server token url');
    cmd.option('--fhir-url-path <fhirUrlPath>', 'FHIR server url path');

    return cmd;
  }
}

export function createMedplumCommand(name: string): MedplumCommand {
  return new MedplumCommand(name);
}
