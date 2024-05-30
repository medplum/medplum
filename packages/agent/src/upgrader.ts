import { Logger } from '@medplum/core';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { downloadRelease, fetchLatestVersionString, getOsString, getReleaseBinPath } from './upgrader-utils';

const globalLogger = new Logger((msg) => console.log(msg));

export async function upgraderMain(argv: string[]): Promise<void> {
  // TODO: Remove this when Linux auto-update is supported
  if (getOsString() === 'linux') {
    throw new Error('Auto-upgrading is not currently supported for Linux');
  }

  // NOTE: Windows past this point, for now

  // Make sure if version is given, it matches semver
  if (argv[3] && !/\d+\.\d+\.\d+/.test(argv[3])) {
    throw new Error('Invalid version specified');
  }
  const version = argv[3] ?? (await fetchLatestVersionString());
  const binPath = getReleaseBinPath(version);

  // If release in not locally downloaded, download it first
  if (!existsSync(binPath)) {
    // Download release
    await downloadRelease(version, binPath);
  }

  try {
    // Stop service
    execSync('net stop "Medplum Agent"');
    // Run installer
    execSync(`${binPath} /S`);
  } catch (err: unknown) {
    // Try to restart Agent service if anything goes wrong
    globalLogger.error('Failed to run installer, attempting to restart agent service...');
    execSync('net start "Medplum Agent"');
    throw err;
  }
}
