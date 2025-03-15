import { ChildProcess, execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPidFile, getPidFilePath, removePidFile } from './pid';

const TEST_APP_TEMPLATE_PATH = path.resolve(__dirname, '../testdata/test-app-template.ts');
const APP_NAME = 'test-pid-app';

let compiledTemplate: string | undefined;
console.log = jest.fn();

function createTestApp(appName: string): string {
  if (!compiledTemplate) {
    // Compile template
    console.log(`Compiling template from ${TEST_APP_TEMPLATE_PATH}...`);
    // We compile with esbuild, otherwise if trying to dynamically import the file directly in a new file, we will run into
    // The issue of trying to import uncompiled TS files directly into the Node runtime
    // Compiling dynamically like this ensures we always have the latest version of the PID module
    compiledTemplate = execSync(
      `esbuild ${TEST_APP_TEMPLATE_PATH} --bundle --platform=node --target=node20 --format=cjs`,
      {
        stdio: 'pipe',
        encoding: 'utf-8',
      }
    );
  }

  try {
    const scriptPath = path.join(tmpdir(), `${appName}.js`);
    fs.writeFileSync(scriptPath, compiledTemplate.replace('$___APP_NAME___$', APP_NAME));

    // Verify the JS file was created
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Failed to write ${scriptPath} - not found`);
    }
    console.log(`Successfully compiled to ${scriptPath}`);
    return scriptPath;
  } catch (err) {
    console.error(`Failed to compile TypeScript file: ${err}`);
    throw err;
  }
}

function spawnProcess(
  scriptPath: string,
  args = [],
  options = {}
): {
  child: ChildProcess;
  output: { stdout: string; stderr: string };
  readyPromise: Promise<void>;
  exitPromise: Promise<void>;
} {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    ...options,
  });

  child.stdin?.end();

  // Buffer for stdout and stderr
  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr?.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('error', (err) => {
    console.error(err);
  });

  const readyPromise = new Promise<void>((resolve) => {
    child.on('message', resolve);
  });

  const exitPromise = new Promise<void>((resolve) => {
    child.on('exit', resolve);
  });

  return {
    child,
    output: {
      get stdout() {
        return stdout;
      },
      get stderr() {
        return stderr;
      },
    },
    readyPromise,
    exitPromise,
  };
}

// Make sure we don't leave around any pid files or test files
afterAll(() => {
  const jsAppPath = path.join(tmpdir(), `${APP_NAME}.js`);
  if (fs.existsSync(jsAppPath)) {
    fs.unlinkSync(jsAppPath);
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

  test('creates and removes PID file on normal process lifecycle', async () => {
    const pidFilePath = getPidFilePath(APP_NAME);

    // Create a test app
    const appPath = createTestApp(APP_NAME);

    // Run the app
    const { child, readyPromise, exitPromise } = spawnProcess(appPath, [], { timeout: 5000 });

    await readyPromise;

    // Verify PID file exists
    expect(fs.existsSync(pidFilePath)).toBe(true);

    child.disconnect();

    // Verify PID file content matches the process PID
    const pidContent = fs.readFileSync(pidFilePath, 'utf8').trim();
    expect(pidContent).toBe(child.pid?.toString());

    // Wait for the process to exit
    await exitPromise;

    // Verify PID file is removed after process exit
    expect(fs.existsSync(pidFilePath)).toBe(false);
  });

  test('prevents running multiple instances of the same app', async () => {
    // Create a test app that runs for a longer time
    const appPath = createTestApp(APP_NAME);

    // Run the first instance
    const { child: child1, readyPromise } = spawnProcess(appPath);

    // Wait for the first app to initialize
    await readyPromise;

    // Try to run a second instance, which should fail
    const child2 = spawn(process.execPath, [appPath], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });

    let stderr = '';
    child2.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    // Wait for the second process to exit
    const exitCode = await new Promise((resolve) => {
      child2.on('exit', resolve);
    });

    // Second instance should exit with a non-zero code
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Failed to create PID file');

    // Clean up - kill the first process
    child1.kill('SIGTERM');

    // Wait for the first process to exit
    await new Promise((resolve) => {
      child1.on('exit', resolve);
    });
  });

  test('handles stale PID files correctly', async () => {
    const pidFilePath = getPidFilePath(APP_NAME);

    // Create a "stale" PID file with a PID that doesn't exist
    // Use a very high PID that's unlikely to exist
    const stalePid = '999999';
    fs.writeFileSync(pidFilePath, stalePid);

    // Create and run test app
    const appPath = createTestApp(APP_NAME);
    const { child, readyPromise, exitPromise } = spawnProcess(appPath);

    // Wait for the app to initialize
    await readyPromise;

    // Verify PID file has been overwritten
    const pidContent = fs.readFileSync(pidFilePath, 'utf8').trim();
    expect(pidContent).toBe(child.pid?.toString());

    child.disconnect();

    // Wait for the process to exit
    await exitPromise;
  });

  test('removes PID file on process termination', async () => {
    const pidFilePath = getPidFilePath(APP_NAME);

    // Create a test app that runs for a longer time
    const appPath = createTestApp(APP_NAME);

    // Run the app
    const { child, readyPromise, exitPromise } = spawnProcess(appPath);

    // Wait for the app to initialize
    await readyPromise;

    // Verify PID file exists
    expect(fs.existsSync(pidFilePath)).toBe(true);

    // Forcefully kill the process
    child.kill('SIGTERM');

    await exitPromise;

    // Verify PID file is removed after forceful termination
    expect(fs.existsSync(pidFilePath)).toBe(false);
  });

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
      expect(pidFilePath.startsWith(tmpdir())).toBe(true);
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
