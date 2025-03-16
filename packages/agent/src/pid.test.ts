import fs from 'node:fs';
import { createPidFile, getPidFilePath, pidLogger, registerAgentCleanup, removePidFile } from './pid';

jest.mock('node:fs');
jest.mock('node:os', () => ({
  ...jest.requireActual('node:os'),
  platform: () => 'darwin',
  tmpdir: () => '/tmp',
}));

const mockedFs = jest.mocked(fs);
const APP_NAME = 'test-pid-app';
const TEST_PID_PATH = '/tmp/medplum-agent/test-pid-app.pid';

describe('PID File Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.mkdirSync.mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Clean up any listeners we may have added
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('uncaughtException');
  });

  test('creates and removes PID file on normal process lifecycle', () => {
    // Mock file operations
    mockedFs.writeFileSync.mockImplementation(() => undefined);
    mockedFs.unlinkSync.mockImplementation(() => undefined);
    mockedFs.readFileSync.mockReturnValue(process.pid.toString());
    mockedFs.renameSync.mockImplementation(() => undefined);

    // Mock file existence checks - first for directory check (false), then for file check during removal (true)
    let checkCount = 0;
    mockedFs.existsSync.mockImplementation((p) => {
      checkCount++;
      return checkCount > 1 && p.toString() === TEST_PID_PATH;
    });

    // Create PID file
    const pidFilePath = createPidFile(APP_NAME);
    expect(pidFilePath).toBe(TEST_PID_PATH);

    // Verify write was called with correct arguments
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.pid.tmp'),
      process.pid.toString(),
      expect.any(Object)
    );
    expect(mockedFs.renameSync).toHaveBeenCalledWith(expect.stringContaining('.pid.tmp'), TEST_PID_PATH);

    // Remove PID file
    removePidFile(pidFilePath);

    // Verify unlink was called
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(TEST_PID_PATH);
  });

  test('prevents running multiple instances of the same app', () => {
    // Mock existing process
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue('1234');

    // Mock process.kill to simulate existing process
    const originalKill = process.kill;
    process.kill = jest.fn();

    try {
      // Attempt to create PID file should throw
      expect(() => createPidFile(APP_NAME)).toThrow('test-pid-app already running');
      expect(process.kill).toHaveBeenCalledWith(1234, 0);
    } finally {
      process.kill = originalKill;
    }
  });

  test('handles stale PID files correctly', () => {
    // Mock existing but stale PID file
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue('999999');

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

      // Verify write operations
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.pid.tmp'),
        process.pid.toString(),
        expect.any(Object)
      );
      expect(mockedFs.renameSync).toHaveBeenCalledWith(expect.stringContaining('.pid.tmp'), TEST_PID_PATH);
    } finally {
      process.kill = originalKill;
    }
  });

  test('handles EPERM errors correctly', () => {
    // Mock existing but stale PID file
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue('999999');

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
      expect(mockedFs.renameSync).not.toHaveBeenCalled();
    } finally {
      process.kill = originalKill;
    }
  });

  test('handles other errors', () => {
    // Mock existing but stale PID file
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue('999999');

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
      expect(mockedFs.renameSync).not.toHaveBeenCalled();
    } finally {
      process.kill = originalKill;
    }
  });

  test('returns appropriate file path for the current OS', () => {
    const pidFilePath = getPidFilePath(APP_NAME);
    expect(pidFilePath).toBe(TEST_PID_PATH);
  });

  test('safely handles non-existent PID file during removal', () => {
    // Mock file not existing
    mockedFs.existsSync.mockReturnValue(false);

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

    beforeEach(() => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.unlinkSync.mockImplementation(() => undefined);
      originalExit = process.exit;
      process.exit = jest.fn() as unknown as typeof process.exit;
    });

    afterEach(() => {
      process.exit = originalExit;
    });

    test('registers handlers for SIGTERM, SIGINT, and uncaughtException', () => {
      const addListenerSpy = jest.spyOn(process, 'on');
      registerAgentCleanup(TEST_PID_PATH);

      expect(addListenerSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(addListenerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(addListenerSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    test('removes PID file and exits on SIGTERM', () => {
      registerAgentCleanup(TEST_PID_PATH);
      process.emit('SIGTERM');

      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('removes PID file and exits on SIGINT', () => {
      registerAgentCleanup(TEST_PID_PATH);
      process.emit('SIGINT');

      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('removes PID file and exits on uncaughtException', () => {
      registerAgentCleanup(TEST_PID_PATH);
      process.emit('uncaughtException', new Error('Test error'));

      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    test('handles non-existent PID file during cleanup and still exits', () => {
      mockedFs.existsSync.mockReturnValue(false);
      registerAgentCleanup(TEST_PID_PATH);

      process.emit('SIGTERM');

      expect(mockedFs.existsSync).toHaveBeenCalledWith(TEST_PID_PATH);
      expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('handles file system errors during cleanup and still exits', () => {
      const pidLoggerErrorSpy = jest.spyOn(pidLogger, 'error').mockImplementation();
      mockedFs.unlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      registerAgentCleanup(TEST_PID_PATH);
      process.emit('SIGTERM');

      expect(pidLoggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error removing PID file: /tmp/medplum-agent/test-pid-app.pid'),
        new Error('Permission denied')
      );
      expect(process.exit).toHaveBeenCalledWith(0);
      pidLoggerErrorSpy.mockRestore();
    });
  });
});
