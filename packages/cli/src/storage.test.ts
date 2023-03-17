import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import { sep } from 'path';
import { FileSystemStorage } from './storage';

jest.mock('os');

const testHomeDir = mkdtempSync(__dirname + sep + 'storage-');

// unlinkSync
// existsSync
// readFileSync
// writeFileSync

describe('FileSystemStorage', () => {
  // beforeEach(() => {
  //   jest.resetModules();
  //   (os.homedir as unknown as jest.Mock).mockReturnValue(true);
  // });

  beforeAll(async () => {
    // const config = await loadTestConfig();
    // await initApp(app, config);
    // accessToken = await initTestAuth();
    (os.homedir as unknown as jest.Mock).mockReturnValue(testHomeDir);
  });

  afterAll(async () => {
    // await shutdownApp();
    rmSync(testHomeDir, { recursive: true, force: true });
  });

  test('Read and write', async () => {
    const storage = new FileSystemStorage();

    expect(storage.getString('foo')).toBeUndefined();

    storage.setString('foo', 'bar');

    expect(storage.getString('foo')).toEqual('bar');

    storage.setString('foo', 'baz');

    expect(storage.getString('foo')).toEqual('baz');

    storage.setString('foo', undefined);

    expect(storage.getString('foo')).toBeUndefined();

    storage.clear();

    expect(storage.getString('foo')).toBeUndefined();
  });
});
