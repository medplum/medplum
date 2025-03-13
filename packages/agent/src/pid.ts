import { normalizeErrorString } from '@medplum/core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

/**
 * Get the appropriate PID file location based on OS
 * @param appName - The name of the application
 * @returns The path to the PID file
 */
export function getPidFilePath(appName: string): string {
  return path.join(os.tmpdir(), `${appName}.pid`);
}

/**
 * Remove the PID file
 * @param pidFilePath - Path to the PID file
 */
export function removePidFile(pidFilePath: string): void {
  if (fs.existsSync(pidFilePath)) {
    try {
      fs.unlinkSync(pidFilePath);
      console.log(`PID file removed: ${pidFilePath}`);
    } catch (err) {
      console.error(`Failed to remove PID file: ${normalizeErrorString(err)}`);
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
    try {
      // Sending signal 0 doesn't actually send a signal but checks if process exists
      process.kill(Number.parseInt(existingPid, 10), 0);
      console.error(`Process already running with PID ${existingPid}`);
      throw new Error(`${appName} already running`);
    } catch (_err) {
      // Process not running, we can overwrite the PID file
      console.log('Stale PID file found. Overwriting...');
    }
  }

  // Write the PID file atomically using a temporary file
  const tempFile = `${pidFilePath}.tmp`;
  fs.writeFileSync(tempFile, pid.toString(), { flag: 'w+' });
  fs.renameSync(tempFile, pidFilePath);

  console.log(`PID file created at: ${pidFilePath}`);

  return pidFilePath;
}
