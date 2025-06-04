import { normalizeErrorString } from '@medplum/core';
import { agentMain } from './agent-main';
import { getGlobalLogger } from './logger';
import { createPidFile, registerAgentCleanup } from './pid';
import { upgraderMain } from './upgrader';

export async function main(argv: string[]): Promise<void> {
  registerAgentCleanup();
  if (argv[2] === '--upgrade') {
    createPidFile('medplum-agent-upgrader');
    await upgraderMain(argv);
  } else {
    createPidFile('medplum-agent');
    await agentMain(argv);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv).catch((err) => {
    getGlobalLogger().error(normalizeErrorString(err));
    process.exit(1);
  });
}
