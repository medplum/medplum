import { MedplumClient } from '@medplum/core';
import { existsSync, readFileSync } from 'fs';
import { App } from './app';

interface Args {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  agentId: string;
}

export async function main(argv: string[]): Promise<void> {
  let args: Args;
  if (argv.length >= 6) {
    args = readCommandLineArgs(argv);
  } else if (existsSync('agent.properties')) {
    args = readPropertiesFile('agent.properties');
  } else {
    console.log('Missing arguments');
    console.log('Arguments can be passed on the command line or in a properties file.');
    console.log('Example with command line arguments:');
    console.log('    node medplum-agent.js <baseUrl> <clientId> <clientSecret> <agentId>');
    console.log('Example with properties file:');
    console.log('    node medplum-agent.js');
    process.exit(1);
  }

  if (!args.baseUrl || !args.clientId || !args.clientSecret || !args.agentId) {
    console.log('Missing arguments');
    console.log('Expected arguments:');
    console.log('    baseUrl: The Medplum server base URL.');
    console.log('    clientId: The OAuth client ID.');
    console.log('    clientSecret: The OAuth client secret.');
    console.log('    agentId: The Medplum agent ID.');
    process.exit(1);
  }

  const { baseUrl, clientId, clientSecret, agentId } = args;

  const medplum = new MedplumClient({ baseUrl, clientId });
  await medplum.startClientLogin(clientId, clientSecret);

  const app = new App(medplum, agentId);
  await app.start();

  process.on('SIGINT', () => {
    console.log('\ngracefully shutting down from SIGINT (Crtl-C)');
    app.stop();
    process.exit();
  });
}

function readCommandLineArgs(argv: string[]): Args {
  const [_node, _script, baseUrl, clientId, clientSecret, agentId] = argv;
  return { baseUrl, clientId, clientSecret, agentId };
}

function readPropertiesFile(fileName: string): Args {
  return Object.fromEntries(
    readFileSync(fileName)
      .toString()
      .split('\n')
      .map((line) => line.split('=').map((s) => s.trim()))
  );
}

if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv).catch(console.error);
}
