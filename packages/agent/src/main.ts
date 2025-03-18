import { agentMain } from './agent-main';
import { createPidFile, registerAgentCleanup } from './pid';
import { upgraderMain } from './upgrader';

export async function main(argv: string[]): Promise<void> {
  if (argv[2] === '--upgrade') {
    const pidFilePath = createPidFile('medplum-agent-upgrader');
    registerAgentCleanup(pidFilePath);
    await upgraderMain(argv);
  } else if (argv[2] === '--stopgap') {
    // Use a different PID file for the stopgap agent
    const pidFilePath = createPidFile('medplum-agent-stopgap');
    registerAgentCleanup(pidFilePath);
    await agentMain(argv);
  } else {
    const pidFilePath = createPidFile('medplum-agent');
    registerAgentCleanup(pidFilePath);
    await agentMain(argv);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv).catch((err) => {
    console.log(err);
    process.exit(1);
  });
}
