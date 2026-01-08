// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { fetchLatestVersionString, isValidMedplumSemver, Logger, normalizeErrorString } from '@medplum/core';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import process from 'node:process';
import * as semver from 'semver';
import { downloadRelease, getReleaseBinPath } from './upgrader-utils';

export async function upgraderMain(argv: string[]): Promise<void> {
  // TODO: Add support for Linux
  if (platform() !== 'win32') {
    throw new Error(`Unsupported platform: ${platform()}. Agent upgrader currently only supports Windows`);
  }

  // NOTE: Windows past this point, for now

  const globalLogger = new Logger((msg) => console.log(msg));

  if (!process.send) {
    globalLogger.error('Upgrader not started as a child process with Node IPC enabled. Aborting...');
    process.exit(1);
  }

  let rejectOnTimeout!: () => void;
  const disconnectedPromise = new Promise<void>((resolve, reject) => {
    rejectOnTimeout = () => reject(new Error('Timed out while waiting for IPC to disconnect'));
    process.once('disconnect', resolve);
  });

  // Make sure if version is given, it matches semver
  if (argv[3] && !isValidMedplumSemver(argv[3])) {
    throw new Error('Invalid version specified');
  }
  const version = argv[3] ?? (await fetchLatestVersionString('agent-upgrader'));
  const binPath = getReleaseBinPath(version);

  // If release in not locally downloaded, download it first
  if (!existsSync(binPath)) {
    // Download release
    globalLogger.info(`Could not find binary at "${binPath}". Downloading release from GitHub...`);
    await downloadRelease(version, binPath);
    globalLogger.info('Release successfully downloaded');
  }

  process.send({ type: 'STARTED' });

  globalLogger.info('Waiting for parent to disconnect from IPC...');
  const disconnectTimeout = setTimeout(rejectOnTimeout, 5000);
  await disconnectedPromise;
  clearTimeout(disconnectTimeout);

  try {
    // If downgrading to a pre-zero-downtime agent (pre-4.2.4), stop and uninstall the current agent service before continuing
    if (semver.lt(version, '4.2.4')) {
      // Call the current binary with the --remove-old-services and the --all flags to remove all existing agent services before installing the "new" (old, pre-4.2.4) agent
      globalLogger.info('Uninstalling the current agent service before installing the pre-zero-downtime agent...');
      spawnSync(__filename, ['--remove-old-services', '--all']);
      globalLogger.info('Successfully uninstalled all existing agent services');

      // We use this command to create a mock 'MedplumAgent' service, which allows us to preserve the agent.properties file by opting into the 'Upgrade' installer path
      globalLogger.info('Creating mock MedplumAgent service to opt into "Upgrade" path in installer...');
      execSync('sc.exe create MedplumAgent binPath=cmd.exe');
      globalLogger.info('Successfully created mock service');
    }

    // Run installer
    globalLogger.info('Running installer silently', { binPath });
    spawnSync(`"${binPath}" /S`, { windowsHide: true, shell: true });
    globalLogger.info(`Agent version ${version} successfully installed`);
  } catch (err: unknown) {
    // Try to restart Agent service if anything goes wrong
    globalLogger.error(`Error while attempting to run installer: ${normalizeErrorString(err)}`);
    globalLogger.error('Failed to run installer, attempting to restart agent service...');
    try {
      execSync('net start "Medplum Agent"');
      globalLogger.info('Successfully restarted agent service');
    } catch (_err: unknown) {
      globalLogger.info('Medplum agent already started, skipping restart');
    }
    return;
  }

  globalLogger.info('Finished upgrade');
}
