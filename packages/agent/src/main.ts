import { existsSync } from 'node:fs';
import { agentMain } from './agent-main';
import { createPidFile, registerAgentCleanup } from './pid';
import { upgraderMain } from './upgrader';
import { UPGRADE_MANIFEST_PATH } from './upgrader-utils';

export async function main(argv: string[]): Promise<void> {
  registerAgentCleanup();
  if (argv[2] === '--upgrade') {
    createPidFile('medplum-agent-upgrader');
    await upgraderMain(argv);
  } else if (existsSync(UPGRADE_MANIFEST_PATH)) {
    // If we are the agent starting up just after upgrading, skip checking pid file until later
    // We do want to do the "upgrading-agent" check though
    // Which prevents multiple agents from competing to complete the upgrade in case multiple agent processes restart at the same time
    // After we finish upgrade, we will attempt to take over and register agent cleanup for
    createPidFile('medplum-upgrading-agent');
    await agentMain(argv);
  } else {
    createPidFile('medplum-agent');
    await agentMain(argv);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv).catch((err) => {
    console.log(err);
    process.exit(1);
  });
}
