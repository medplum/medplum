import fs, { PathOrFileDescriptor } from 'node:fs';
import { dirname } from 'node:path';
import {
  createPidFile,
  deregisterAgentCleanup,
  getPidFilePath,
  pidLogger,
  registerAgentCleanup,
  removePidFile,
} from './pid';

jest.mock('node:fs');
jest.mock('node:os', () => ({
  ...jest.requireActual('node:os'),
  platform: () => 'darwin',
  tmpdir: () => '/tmp',
}));

const mockedFs = jest.mocked(fs);
const APP_NAME = 'test-pid-app';
const PID_DIR = dirname(getPidFilePath(APP_NAME));
const TEST_PID_PATH = '/tmp/medplum-agent/test-pid-app.pid';
const createdPidFiles = new Set<string>();

describe('PID File Manager', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedFs.existsSync.mockImplementation((filePath: PathOrFileDescriptor) => {
      // This is for the `ensureDirectoryExists` check
      if (filePath.toString() === PID_DIR) {
        return true;
      }
      if (createdPidFiles.has(filePath.toString())) {
        return true;
      }
      return false;
    });
    mockedFs.mkdirSync.mockImplementation(() => undefined);
    mockedFs.readFileSync.mockImplementation((filePath: PathOrFileDescriptor) => {
      if (createdPidFiles.has(filePath.toString())) {
        return process.pid.toString();
      }
      const err = new Error('ENOENT');
      (err as Error & { code: string }).code = 'ENOENT';
      throw err;
    });
    mockedFs.writeFileSync.mockImplementation((filePath: PathOrFileDescriptor) => {
      if (createdPidFiles.has(filePath.toString())) {
        throw new Error('File already exists');
      }
      createdPidFiles.add(filePath.toString());
      return undefined;
    });
    mockedFs.unlinkSync.mockImplementation((filePath: PathOrFileDescriptor) => {
      createdPidFiles.delete(filePath.toString());
      return undefined;
    });
  });

  afterEach(() => {
    // Clean up any listeners we may have added
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('uncaughtException');
    createdPidFiles.clear();
  });

  test('creates and removes PID file on normal process lifecycle', () => {
    // Create PID file
    const pidFilePath = createPidFile(APP_NAME);
    expect(pidFilePath).toBe(TEST_PID_PATH);

    // Verify write was called with correct arguments
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.pid'),
      process.pid.toString(),
      expect.objectContaining({
        flag: 'wx',
      })
    );

    // Remove PID file
    removePidFile(pidFilePath);

    // Verify unlink was called
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(TEST_PID_PATH);
  });

  test('prevents running multiple instances of the same app', () => {
    createPidFile(APP_NAME);

    // Mock process.kill to simulate existing process
    const originalKill = process.kill;
    process.kill = jest.fn();

    try {
      // Attempt to create PID file should throw
      expect(() => createPidFile(APP_NAME)).toThrow('test-pid-app already running');
      expect(process.kill).toHaveBeenCalledWith(process.pid, 0);
    } finally {
      process.kill = originalKill;
    }
  });

  test('handles stale PID files correctly', () => {
    createPidFile(APP_NAME);

    // Mock process.kill to simulate non-existent process
    const originalKill = process.kill;
    process.kill = jest.fn().mockImplementation(() => {
      // This is the Error thrown from Node when a process does not exist
      const esrchError = new Error();
      (esrchError as Error & { code: string }).code = 'ESRCH';
      throw esrchError;
    });

    try {
      // Should succeed and overwrite stale PID file
      const pidFilePath = createPidFile(APP_NAME);
      expect(pidFilePath).toBe(TEST_PID_PATH);

      // Make sure stale PID file was deleted
      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(TEST_PID_PATH);

      // Verify write operations
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.pid'),
        process.pid.toString(),
        expect.objectContaining({
          flag: 'wx',
        })
      );
    } finally {
      process.kill = originalKill;
    }
  });

  test('handles EPERM errors correctly', () => {
    createPidFile(APP_NAME);
    mockedFs.writeFileSync.mockClear();

    // Mock process.kill to simulate non-existent process
    const originalKill = process.kill;
    process.kill = jest.fn().mockImplementation(() => {
      const epermError = new Error();
      (epermError as Error & { code: string }).code = 'EPERM';
      throw epermError;
    });

    try {
      // Should fail
      expect(() => createPidFile(APP_NAME)).toThrow(`${APP_NAME} already running`);

      // Verify write operations didn't occur
      expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
    } finally {
      process.kill = originalKill;
    }
  });

  test('handles other errors', () => {
    createPidFile(APP_NAME);
    mockedFs.writeFileSync.mockClear();

    // Mock process.kill to simulate non-existent process
    const originalKill = process.kill;
    process.kill = jest.fn().mockImplementation(() => {
      throw new Error('Unknown error');
    });

    try {
      // Should fail
      expect(() => createPidFile(APP_NAME)).toThrow(new Error('Unknown error'));

      // Verify write operations didn't occur
      expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
    } finally {
      process.kill = originalKill;
    }
  });

  test('returns appropriate file path for the current OS', () => {
    const pidFilePath = getPidFilePath(APP_NAME);
    expect(pidFilePath).toBe(TEST_PID_PATH);
  });

  test('safely handles non-existent PID file during removal', () => {
    // Should not throw
    removePidFile(TEST_PID_PATH);

    // Verify unlink was not called
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });

  test('handles file system errors during PID file creation', () => {
    // Mock write failure
    mockedFs.writeFileSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    // Should throw
    expect(() => createPidFile(APP_NAME)).toThrow('Permission denied');
  });

  test('handles file system errors during PID file removal', () => {
    // Mock file existing but unlink failing
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.unlinkSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    // Should not throw
    expect(() => removePidFile(TEST_PID_PATH)).not.toThrow('Permission denied');

    // Verify unlink was attempted
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(TEST_PID_PATH);
  });

  describe('registerAgentCleanup', () => {
    let originalExit: typeof process.exit;
    let processOnMock: jest.SpyInstance;
    let processEvents: Record<string, (err?: Error) => void> = {};

    beforeEach(() => {
      originalExit = process.exit;
      process.exit = jest.fn() as unknown as typeof process.exit;
      processOnMock = jest.spyOn(process, 'on').mockImplementation((signal, cb) => {
        processEvents[signal.toString()] = cb;
        return process; // For chaining
      });
    });

    afterEach(() => {
      process.exit = originalExit;
      processOnMock.mockClear();
      processEvents = {};
      deregisterAgentCleanup();
    });

    test('registers handlers for SIGTERM, SIGINT, SIGHUP, and uncaughtException', () => {
      const addListenerSpy = jest.spyOn(process, 'on');
      registerAgentCleanup();

      expect(addListenerSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(addListenerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(addListenerSpy).toHaveBeenCalledWith('SIGHUP', expect.any(Function));
      expect(addListenerSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));

      addListenerSpy.mockClear();
    });

    test('removes PID file and exits on SIGTERM', async () => {
      registerAgentCleanup();
      createPidFile(APP_NAME);

      processEvents.SIGTERM?.();

      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('removes PID file and exits on SIGINT', () => {
      registerAgentCleanup();
      createPidFile(APP_NAME);

      processEvents.SIGINT?.();

      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('removes PID file and exits on SIGHUP', () => {
      registerAgentCleanup();
      createPidFile(APP_NAME);

      processEvents.SIGHUP?.();

      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('removes PID file and exits on uncaughtException', () => {
      registerAgentCleanup();
      createPidFile(APP_NAME);

      processEvents.uncaughtException?.(new Error('Test error'));

      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    test('handles non-existent PID file during cleanup and still exits', () => {
      registerAgentCleanup();
      const pidFilePath = createPidFile(APP_NAME);
      mockedFs.unlinkSync(pidFilePath);
      mockedFs.unlinkSync.mockReset();

      processEvents.SIGTERM?.();

      expect(mockedFs.existsSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('handles file system errors during cleanup and still exits', () => {
      const pidLoggerErrorSpy = jest.spyOn(pidLogger, 'error').mockImplementation();
      mockedFs.unlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      registerAgentCleanup();
      createPidFile(APP_NAME);
      processEvents.SIGTERM?.();

      expect(pidLoggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error removing PID file: /tmp/medplum-agent/test-pid-app.pid'),
        new Error('Permission denied')
      );
      expect(process.exit).toHaveBeenCalledWith(0);
      pidLoggerErrorSpy.mockRestore();
    });
  });
});
