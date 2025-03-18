import { agentMain } from './agent-main';
import { createPidFile, registerAgentCleanup } from './pid';
import { upgraderMain } from './upgrader';

export async function main(argv: string[]): Promise<void> {
  registerAgentCleanup();
  if (argv[2] === '--upgrade') {
    createPidFile('medplum-agent-upgrader');
    await upgraderMain(argv);
  } else if (argv[2] === '--stopgap') {
    // Use a different PID file for the stopgap agent
    const pidFilePath = createPidFile('medplum-agent-stopgap');
    registerAgentCleanup(pidFilePath);
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
