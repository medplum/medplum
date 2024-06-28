import { Logger, normalizeErrorString } from '@medplum/core';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import process from 'node:process';
import { downloadRelease, fetchLatestVersionString, getReleaseBinPath, isValidSemver } from './upgrader-utils';

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
    process.once('disconnect', () => {
      resolve();
    });
  });

  process.send({ type: 'STARTED' });

  // Make sure if version is given, it matches semver
  if (argv[3] && !isValidSemver(argv[3])) {
    throw new Error('Invalid version specified');
  }
  const version = argv[3] ?? (await fetchLatestVersionString());
  const binPath = getReleaseBinPath(version);

  // If release in not locally downloaded, download it first
  if (!existsSync(binPath)) {
    // Download release
    globalLogger.info(`Could not find binary at "${binPath}". Downloading release from GitHub...`);
    await downloadRelease(version, binPath);
    globalLogger.info('Release successfully downloaded');
  }

  globalLogger.info('Waiting for parent to disconnect from IPC...');
  const disconnectTimeout = setTimeout(rejectOnTimeout, 5000);
  await disconnectedPromise;
  clearTimeout(disconnectTimeout);

  try {
    // Stop service
    globalLogger.info('Stopping running agent service...');
    execSync('net stop "Medplum Agent"');
    globalLogger.info('Agent service stopped succesfully');
  } catch (_err: unknown) {
    globalLogger.info('Agent service not running, skipping stopping the service');
  }

  try {
    // Run installer
    globalLogger.info('Running installer silently', { binPath });
    spawnSync(binPath, ['/S']);
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
