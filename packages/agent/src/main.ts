// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MEDPLUM_VERSION, normalizeErrorString } from '@medplum/core';
import { execSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, openSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentMain } from './agent-main';
import { createPidFile, registerAgentCleanup } from './pid';
import { upgraderMain } from './upgrader';
import { UPGRADE_MANIFEST_PATH } from './upgrader-utils';

const TEMP_LOG_FILE = path.join(
  dirname(UPGRADE_MANIFEST_PATH),
  `stop-service-logs-${new Date().toISOString().replace(/:\s*/g, '-')}.txt`
);

export async function main(argv: string[]): Promise<void> {
  registerAgentCleanup();
  if (argv[2] === '--upgrade') {
    createPidFile('medplum-agent-upgrader');
    await upgraderMain(argv);
  } else if (argv[2] === '--remove-old-services') {
    const logFileFd = openSync(TEMP_LOG_FILE, 'a');

    let allAgentServices: string[] = [];
    const currentServiceName = `MedplumAgent_${MEDPLUM_VERSION}`;

    while (!allAgentServices.includes(currentServiceName)) {
      const output = execSync('cmd.exe /c sc query type= service state= all | findstr /i "SERVICE_NAME.*MedplumAgent"');
      appendFileSync(logFileFd, `${output}\r\n`, { encoding: 'utf-8' });
      allAgentServices = output
        .toString()
        .trim()
        .split('\n')
        .map((line) => line.replace('SERVICE_NAME: ', '').trim());
      appendFileSync(logFileFd, `All services: \r\n${allAgentServices.join('\r\n')}\r\n`, { encoding: 'utf-8' });
    }

    const servicesToRemove =
      argv[3] === '--all'
        ? allAgentServices
        : allAgentServices.filter((serviceName) => serviceName !== `MedplumAgent_${MEDPLUM_VERSION}`);
    appendFileSync(logFileFd, `Medplum agent service to filter out: MedplumAgent_${MEDPLUM_VERSION}\r\n`, {
      encoding: 'utf-8',
    });

    for (const serviceName of servicesToRemove) {
      // We try to stop the service and continue even if it fails
      try {
        execSync(`net stop ${serviceName}`);
        appendFileSync(logFileFd, `${serviceName} stopped\r\n`, { encoding: 'utf-8' });
        console.log(`${serviceName} stopped`);
      } catch (err) {
        appendFileSync(logFileFd, `Failed to stop service: ${serviceName}\r\n`, { encoding: 'utf-8' });
        appendFileSync(logFileFd, `${normalizeErrorString(err)}\r\n`, { encoding: 'utf-8' });
        console.error(`Failed to stop service: ${serviceName}`);
        console.error(normalizeErrorString(err));
      }
      // We try to delete the service even if stopping it failed
      try {
        execSync(`sc.exe delete ${serviceName}`);
        appendFileSync(logFileFd, `${serviceName} deleted\r\n`, { encoding: 'utf-8' });
        console.log(`${serviceName} deleted`);
      } catch (err) {
        appendFileSync(logFileFd, `Failed to delete service: ${serviceName}\r\n`, { encoding: 'utf-8' });
        appendFileSync(logFileFd, `${normalizeErrorString(err)}\r\n`, { encoding: 'utf-8' });
        console.error(`Failed to delete service: ${serviceName}`);
        console.error(normalizeErrorString(err));
      }
    }

    closeSync(logFileFd);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv).catch((err) => {
    console.log(err);
    process.exit(1);
  });
}
