import { Logger } from '@medplum/core';
import fs from 'node:fs';
import { platform, tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

export const pidLogger = new Logger((msg) => `[PID]: ${msg}`);

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
 * Remove the PID file
 * @param pidFilePath - Path to the PID file
 */
export function removePidFile(pidFilePath: string): void {
  if (fs.existsSync(pidFilePath)) {
    try {
      fs.unlinkSync(pidFilePath);
      pidLogger.info(`PID file removed: ${pidFilePath}`);
    } catch (err) {
      pidLogger.error(`Error removing PID file: ${pidFilePath}`, err as Error);
    }
  }
}

/**
 * Create a PID file for the current process
 * @param appName - Optional application name, defaults to script filename
 * @returns Object containing success status and pidFilePath
 */
export function createPidFile(appName: string): string {
  const pid = process.pid;
  const pidFilePath = getPidFilePath(appName);

  // Check if PID file already exists
  if (fs.existsSync(pidFilePath)) {
    const existingPid = fs.readFileSync(pidFilePath, 'utf8').trim();

    // Check if the process with this PID is still running
    let processRunning = false;
    try {
      pidLogger.info('Checking if process is running');
      // Sending signal 0 doesn't actually send a signal but checks if process exists
      process.kill(Number.parseInt(existingPid, 10), 0);
      // If we didn't throw an error above, the process is still running, and PID is not stale
      processRunning = true;
    } catch (_err) {
      // Process not running, we can overwrite the PID file
      pidLogger.info('Stale PID file found. Overwriting...');
    }

    if (processRunning) {
      throw new Error(`${appName} already running`);
    }
  }

  // We need to make sure the directory exists first since we aren't just using a system-created dir like /var/run
  ensureDirectoryExists(path.dirname(pidFilePath));

  // Write the PID file atomically using a temporary file
  const tempFile = `${pidFilePath}.tmp`;
  fs.writeFileSync(tempFile, pid.toString(), { flag: 'w+' });
  fs.renameSync(tempFile, pidFilePath);

  pidLogger.info(`PID file created at: ${pidFilePath}`);

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
 * Cleans up the PID file in the event of any process exit scenario.
 * @param pidFilePath - The PID file for this application.
 */
export function registerAgentCleanup(pidFilePath: string): void {
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
    pidLogger.error('Uncaught exception:', err);
    removePidFile(pidFilePath);
    process.exit(1);
  });
}
