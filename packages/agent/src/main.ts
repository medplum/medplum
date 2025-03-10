import { agentMain } from './agent-main';
import { createPidFile, removePidFile } from './pid';
import { upgraderMain } from './upgrader';

function registerAgentCleanup(pidFilePath: string): void {
  // Handle normal exit
  process.on('exit', () => removePidFile(pidFilePath));

  // Handle various signals
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      removePidFile(pidFilePath);
      process.exit(0);
    });
  }

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    removePidFile(pidFilePath);
    process.exit(1);
  });
}

export async function main(argv: string[]): Promise<void> {
  if (argv[2] === '--upgrade') {
    const pidFilePath = createPidFile('medplum-agent-upgrader');
    registerAgentCleanup(pidFilePath);
    await upgraderMain(argv);
  } else {
    const pidFilePath = createPidFile('medplum-agent');
    registerAgentCleanup(pidFilePath);
    await agentMain(argv);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv).catch(console.error);
}
