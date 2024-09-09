import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { sep } from 'node:path';
import { FileSystemStorage } from './storage';

jest.mock('node:os');

const testHomeDir = mkdtempSync(__dirname + sep + 'storage-');

describe('FileSystemStorage', () => {
  beforeAll(async () => {
    (os.homedir as unknown as jest.Mock).mockReturnValue(testHomeDir);
  });

  afterAll(async () => {
    rmSync(testHomeDir, { recursive: true, force: true });
  });

  test('Read and write', async () => {
    const storage = new FileSystemStorage('default');

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

  test('getObject and setObject', async () => {
    const storage = new FileSystemStorage('default');

    const obj = { profiles: { a: 1, b: 2 } };

    // Make sure the object does not exist yet
    expect(storage.getObject('objKey')).toBeUndefined();

    // Set and retrieve the object
    storage.setObject('objKey', obj);
    expect(storage.getObject('objKey')).toEqual(obj);

    // Change the object and ensure it's updated
    const newObj = { profiles: { a: 5 } };
    storage.setObject('objKey', newObj);
    expect(storage.getObject('objKey')).toEqual(newObj);

    // Remove the object and ensure it's gone
    storage.setObject('objKey', undefined);
    expect(storage.getObject('objKey')).toBeUndefined();

    storage.clear();

    // After clearing, the object should still be gone
    expect(storage.getObject('objKey')).toBeUndefined();
  });
});
