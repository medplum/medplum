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
  const platform = os.platform();

  switch (platform) {
    case 'linux':
      // Prefer /run if we have write access, fallback to /var/run, then /tmp
      try {
        fs.accessSync('/run', fs.constants.W_OK);
        return path.join('/run', `${appName}.pid`);
      } catch (_err) {
        try {
          fs.accessSync('/var/run', fs.constants.W_OK);
          return path.join('/var/run', `${appName}.pid`);
        } catch (_err) {
          return path.join('/tmp', `${appName}.pid`);
        }
      }

    case 'win32':
      // Use %TEMP% directory for Windows
      return path.join(os.tmpdir(), `${appName}.pid`);

    case 'darwin':
      // For macOS, try /var/run first, then fall back to /tmp
      try {
        fs.accessSync('/var/run', fs.constants.W_OK);
        return path.join('/var/run', `${appName}.pid`);
      } catch (_err) {
        return path.join('/tmp', `${appName}.pid`);
      }

    default:
      // Default fallback for any other OS
      return path.join(os.tmpdir(), `${appName}.pid`);
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
  const platform = os.platform();

  // Ensure the directory exists (mainly for Windows ProgramData)
  if (platform === 'win32' && pidFilePath.includes('ProgramData')) {
    fs.mkdirSync(path.dirname(pidFilePath), { recursive: true });
  }

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
  fs.writeFileSync(tempFile, pid.toString());
  fs.renameSync(tempFile, pidFilePath);

  console.log(`PID file created at: ${pidFilePath}`);

  return pidFilePath;
}
