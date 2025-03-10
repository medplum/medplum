import { sleep } from '@medplum/core';
import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createPidFile, getPidFilePath, removePidFile } from './pid';

const APP_NAME = 'test-pid-app';

function createTestApp(appName: string): string {
  const scriptPath = path.join(__dirname, `${appName}-test-app.js`);
  const script = `
    const { createPidFile } = require('./pid');

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

    // Create PID file
    try {
      const pidFilePath = createPidFile('${appName}');
      console.log(\`Test app running with PID: \${process.pid}\`);
      console.log(\`PID file created at: \${pidFilePath}\`);
    } catch (err) {
      console.error('Failed to create PID file, another instance may be running');
      process.exit(1);  
    }
  `;

  fs.writeFileSync(scriptPath, script);
  return scriptPath;
}

function spawnProcess(
  scriptPath: string,
  args = [],
  options = {}
): { child: ChildProcess; output: { stdout: string; stderr: string }; stdoutEndPromise: Promise<void> } {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    stdio: 'pipe',
    ...options,
  });

  child.stdin.end();

  // Buffer for stdout and stderr
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  const stdoutEndPromise = new Promise<void>((resolve) => {
    child.stdout.on('end', resolve);
  });

  return {
    child,
    output: { stdout, stderr },
    stdoutEndPromise,
  };
}

// Make sure we don't leave around any pid files or test files
afterAll(() => {
  const appPath = path.join(__dirname, `${APP_NAME}-test-app.js`);
  if (fs.existsSync(appPath)) {
    fs.unlinkSync(appPath);
  }

  const pidFilePath = getPidFilePath(APP_NAME);
  if (fs.existsSync(pidFilePath)) {
    fs.unlinkSync(pidFilePath);
  }
});

describe('PID File Manager', () => {
  beforeEach(() => {
    const pidFilePath = getPidFilePath(APP_NAME);
    if (fs.existsSync(pidFilePath)) {
      fs.unlinkSync(pidFilePath);
    }
  });

  test.only('creates and removes PID file on normal process lifecycle', async () => {
    const pidFilePath = getPidFilePath(APP_NAME);

    // Create a test app
    const appPath = createTestApp(APP_NAME);

    // Run the app
    const { child, output, stdoutEndPromise } = spawnProcess(appPath, [], { timeout: 2000 });

    await stdoutEndPromise;
    console.log(output);

    // Verify PID file exists
    expect(fs.existsSync(pidFilePath)).toBe(true);

    // Verify PID file content matches the process PID
    const pidContent = fs.readFileSync(pidFilePath, 'utf8').trim();
    expect(pidContent).toBe(child.pid?.toString());

    // Wait for the process to exit
    await new Promise((resolve) => {
      child.on('exit', resolve);
    });

    // Verify PID file is removed after process exit
    expect(fs.existsSync(pidFilePath)).toBe(false);
  }, 10000); // Increase timeout to 10 seconds for this test

  test('prevents running multiple instances of the same app', async () => {
    // Create a test app that runs for a longer time
    const appPath = createTestApp(APP_NAME);

    // Run the first instance
    const { child: child1, stdoutEndPromise } = spawnProcess(appPath);

    // Wait for the first app to initialize
    await stdoutEndPromise;

    // Try to run a second instance, which should fail
    const child2 = spawn(process.execPath, [appPath]);

    let stderr = '';
    child2.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Wait for the second process to exit
    const exitCode = await new Promise((resolve) => {
      child2.on('exit', resolve);
    });

    // Second instance should exit with a non-zero code
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Process already running');

    // Clean up - kill the first process
    child1.kill('SIGTERM');

    // Wait for the first process to exit
    await new Promise((resolve) => {
      child1.on('exit', resolve);
    });
  }, 10000);

  test('handles stale PID files correctly', async () => {
    const pidFilePath = getPidFilePath(APP_NAME);

    // Create a "stale" PID file with a PID that doesn't exist
    // Use a very high PID that's unlikely to exist
    const stalePid = '999999';
    fs.writeFileSync(pidFilePath, stalePid);

    // Create and run test app
    const appPath = createTestApp(APP_NAME);
    const { child, stdoutEndPromise } = spawnProcess(appPath);

    // Wait for the app to initialize
    await stdoutEndPromise;

    // Verify PID file has been overwritten
    const pidContent = fs.readFileSync(pidFilePath, 'utf8').trim();
    expect(pidContent).toBe(child.pid?.toString());

    // Wait for the process to exit
    await new Promise((resolve) => {
      child.on('exit', resolve);
    });
  }, 10000);

  test('removes PID file on process termination', async () => {
    const pidFilePath = getPidFilePath(APP_NAME);

    // Create a test app that runs for a longer time
    const appPath = createTestApp(APP_NAME);

    // Run the app
    const { child, stdoutEndPromise } = spawnProcess(appPath);

    // Wait for the app to initialize
    await stdoutEndPromise;

    // Verify PID file exists
    expect(fs.existsSync(pidFilePath)).toBe(true);

    // Forcefully kill the process
    child.kill('SIGTERM');

    // Wait a moment for cleanup
    await sleep(500);

    // Verify PID file is removed after forceful termination
    expect(fs.existsSync(pidFilePath)).toBe(false);
  }, 10000);

  test('returns appropriate file path for the current OS', () => {
    const pidFilePath = getPidFilePath(APP_NAME);

    // Verify the path is a string and includes the app name
    expect(typeof pidFilePath).toBe('string');
    expect(pidFilePath).toContain(APP_NAME);

    // Test is platform-specific, so just verify basic structure
    const platform = process.platform;

    if (platform === 'win32') {
      expect(pidFilePath).toContain('Temp');
    } else if (platform === 'darwin' || platform === 'linux') {
      expect(
        pidFilePath.startsWith('/tmp/') || pidFilePath.startsWith('/var/run/') || pidFilePath.startsWith('/run/')
      ).toBe(true);
    }
  });

  test('direct API calls work correctly', () => {
    // Test direct API usage with a temporary test name
    const TEST_NAME = 'direct-api-test';
    const expectedPidFilePath = getPidFilePath(TEST_NAME);

    // Remove any existing file
    if (fs.existsSync(expectedPidFilePath)) {
      fs.unlinkSync(expectedPidFilePath);
    }

    // Create PID file
    const pidFilePath = createPidFile(TEST_NAME);

    // Verify operation was successful
    expect(pidFilePath).toBe(expectedPidFilePath);
    expect(fs.existsSync(expectedPidFilePath)).toBe(true);

    // Read PID file and verify content
    const pidContent = fs.readFileSync(expectedPidFilePath, 'utf8').trim();
    expect(pidContent).toBe(process.pid.toString());

    // Remove PID file
    removePidFile(expectedPidFilePath);

    // Verify file was removed
    expect(fs.existsSync(expectedPidFilePath)).toBe(false);
  });
});
