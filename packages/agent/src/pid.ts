// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Logger, sleep } from '@medplum/core';
import fs, { existsSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const EXIT_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

export type AppPidState = 'running' | 'stale' | 'clean';

export const pidLogger = new Logger((msg) => `[PID]: ${msg}`);
const pidFileApps = new Set<string>();
const processExitListener = (): void => {
  removeAllPidFiles();
};
const signalListener = (): void => {
  removeAllPidFiles();
  process.exit(0);
};
const uncaughtExceptionListener = (err: Error): void => {
  pidLogger.error('Uncaught exception:', err);
  removeAllPidFiles();
  process.exit(1);
};
let agentCleanupSetup = false;

/**
 * Get the appropriate PID file location based on OS
 * @param appName - The name of the application
 * @returns The path to the PID file
 */
export function getPidFilePath(appName: string): string {
  switch (platform()) {
    case 'linux':
    case 'darwin':
      // We use tmpdir for linux and Mac because /var/run requires root access
      // The benefit of using the convention is outweighed by the required permission level to create files/directories inside
      return path.join(tmpdir(), 'medplum-agent', `${appName}.pid`);
    case 'win32':
      return path.join('C:', 'ProgramData', 'MedplumAgent', 'pids', `${appName}.pid`);
    default:
      throw new Error('Invalid OS');
  }
}

/**
 * Remove the PID file for a given app name.
 * @param appName - The name of the app.
 */
export function removePidFile(appName: string): void {
  const pidFilePath = getPidFilePath(appName);
  if (fs.existsSync(pidFilePath)) {
    try {
      fs.unlinkSync(pidFilePath);
      pidLogger.info(`PID file removed: ${pidFilePath}`);
    } catch (err) {
      pidLogger.error(`Error removing PID file: ${pidFilePath}`, err as Error);
    }
  }
  pidFileApps.delete(appName);
}

/**
 * Forcefully kills an application by name if it is running, otherwise it no-ops.
 * @param appName - The application to force kill.
 */
export function forceKillApp(appName: string): void {
  // Get process ID
  const pid = getAppPid(appName);
  if (pid === undefined) {
    pidLogger.info(`${appName} not running, skipping killing app`);
    return;
  }
  process.kill(pid, 'SIGTERM');
}

/**
 * Returns true if a PID points to an existing process, else returns false.
 * @param pid - The PID to check if it exists.
 * @returns Boolean indicating if a process with the given PID exists.
 */
export function checkProcessExists(pid: number): boolean {
  try {
    // Sending signal 0 doesn't actually send a signal but checks if process exists
    process.kill(pid, 0);
    // If we didn't throw an error above, the process is still running, and PID is not stale
    return true;
  } catch (err) {
    // If the error is "ESRCH", the process doesn't exist
    if ((err as Error & { code: string }).code === 'ESRCH') {
      return false;
    }
    // If the error is "EPERM", the process exists but we don't have permission
    if ((err as Error & { code: string }).code === 'EPERM') {
      return true;
    }
    // For any other errors, throw them
    throw err;
  }
}

/**
 * Checks if a given appName has an existing PID and process is still running.
 * @param appName - The name of the application to check the status of.
 * @returns True if application PID exists and is not stale, otherwise returns false.
 */
export function isAppRunning(appName: string): boolean {
  return getAppPidState(appName) === 'running';
}

/**
 * Gets an application's PID from the appropriate PID file by name.
 * @param appName - The name of the application to get the PID of.
 * @returns A numeric PID of the process, or `undefined` if no PID file is found.
 */
export function getAppPid(appName: string): number | undefined {
  const pidFilePath = getPidFilePath(appName);
  if (!fs.existsSync(pidFilePath)) {
    return undefined;
  }
  const existingPidStr = fs.readFileSync(pidFilePath, 'utf8').trim();
  const existingPid = Number.parseInt(existingPidStr, 10);
  if (Number.isNaN(existingPid)) {
    pidLogger.warn('PID file does not contain a valid numeric PID');
    return undefined;
  }
  return existingPid;
}

/**
 * Gets the current state associated with the app PID file.
 * @param appName - The name of the application to get the PID state for.
 * @returns An enum string of `running`, `stale`, or `clean`, depending on the state.
 */
export function getAppPidState(appName: string): AppPidState {
  const pid = getAppPid(appName);
  // If no PID is returned, we are in a clean state
  if (pid === undefined) {
    return 'clean';
  }
  // Check if the process with this PID is still running
  pidLogger.info(`PID file for ${appName} already exists, checking if process is running`);
  if (checkProcessExists(pid)) {
    return 'running';
  }
  return 'stale';
}

/**
 * Create a PID file for the current process
 * @param appName - Optional application name, defaults to script filename
 * @returns Object containing success status and pidFilePath
 */
export function createPidFile(appName: string): string {
  const pid = process.pid;
  const pidFilePath = getPidFilePath(appName);
  const pidState = getAppPidState(appName);

  if (pidState === 'running') {
    throw new Error(`${appName} already running`);
  }

  if (pidState === 'stale') {
    // If we make it here, PID file exists but it's stale
    pidLogger.info('Stale PID file found. Overwriting...');
    fs.unlinkSync(pidFilePath);
  }

  // We need to make sure the directory exists first since we aren't just using a system-created dir like /var/run
  ensureDirectoryExists(path.dirname(pidFilePath));

  // Write the PID file atomically using the wx flag
  // This makes writeFileSync throw when another process tries to create the same file at the same time
  // We do this in order to make sure only one agent process can start up at a given time
  fs.writeFileSync(pidFilePath, pid.toString(), { flag: 'wx' });

  pidLogger.info(`PID file created at: ${pidFilePath}`);

  pidFileApps.add(appName);

  return pidFilePath;
}

/**
 * Ensures PID directory exists.
 * @param directoryPath - The path to the directory.
 */
export function ensureDirectoryExists(directoryPath: string): void {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
    pidLogger.info(`Directory created: ${directoryPath}`);
  } else {
    pidLogger.info(`Directory already exists: ${directoryPath}`);
  }
}

/**
 * Waits for a given app's PID file to be present in the filesystem.
 * @param appName - The name of the app associated with the PID file you want to wait for.
 * @param timeoutMs - The amount of milliseconds to wait before timing out. Default is 3000.
 */
export async function waitForPidFile(appName: string, timeoutMs = 3000): Promise<void> {
  const startTime = Date.now();
  // Wait for agent PID file to exist
  while (!existsSync(getPidFilePath(appName))) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Timeout while waiting for PID file');
    }
    await sleep(0);
  }
}

/**
 * Cleans up all PID files and removes them from the list of PID files to cleanup when the process ends.
 */
export function removeAllPidFiles(): void {
  for (const appName of pidFileApps) {
    removePidFile(appName);
  }
}

/**
 * Cleans up the PID file in the event of any process exit scenario.
 */
export function registerAgentCleanup(): void {
  if (!agentCleanupSetup) {
    // Handle normal exit
    process.on('exit', processExitListener);
    // Handle various signals
    for (const signal of EXIT_SIGNALS) {
      process.on(signal, signalListener);
    }
    // Handle uncaught exceptions
    process.on('uncaughtException', uncaughtExceptionListener);
    agentCleanupSetup = true;
  }
}

/**
 * Deregisters agent cleanup listeners.
 */
export function deregisterAgentCleanup(): void {
  if (agentCleanupSetup) {
    process.off('exit', processExitListener);
    for (const signal of EXIT_SIGNALS) {
      process.off(signal, signalListener);
    }
    process.off('uncaughtException', uncaughtExceptionListener);
    agentCleanupSetup = false;
  }
}
