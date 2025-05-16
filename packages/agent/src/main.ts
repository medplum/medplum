import { MEDPLUM_VERSION, normalizeErrorString } from '@medplum/core';
import { execSync } from 'node:child_process';
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
  } else if (argv[2] === '--stop-old-services') {
    const output = execSync('cmd.exe /c sc query type= service state= all | findstr /i "SERVICE_NAME.*MedplumAgent"', {
      windowsHide: true,
    });
    const allAgentServices = output.toString().trim().split('\r\n');
    const servicesToStop =
      argv[3] === '--all'
        ? allAgentServices
        : allAgentServices.filter((serviceName) => serviceName !== `MedplumAgent_${MEDPLUM_VERSION}`);
    for (const serviceName of servicesToStop) {
      // We try to stop the service and continue even if it fails
      try {
        execSync(`net stop ${serviceName}`);
        console.log(`${serviceName} stopped`);
      } catch (err) {
        console.error(`Failed to stop service: ${serviceName}`);
        console.error(normalizeErrorString(err));
      }
      // We try to delete the service even if stopping it failed
      try {
        execSync(`sc.exe delete ${serviceName}`);
        console.log(`${serviceName} stopped`);
      } catch (err) {
        console.error(`Failed to delete service: ${serviceName}`);
        console.error(normalizeErrorString(err));
      }
    }
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
