import { MedplumClient } from '@medplum/core';
import { App } from './app';

async function main(argv: string[]): Promise<void> {
  if (argv.length < 6) {
    console.log('Usage: node medplum-agent.js <baseUrl> <clientId> <clientSecret> <agentId>');
    process.exit(1);
  }
  const [_node, _script, baseUrl, clientId, clientSecret, agentId] = argv;

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

if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv).catch(console.error);
}
