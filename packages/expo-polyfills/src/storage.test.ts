import { sleep } from '@medplum/core';
import SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ExpoClientStorage, SyncSecureStorage } from './storage';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  let getKeysShouldThrow = false;
  return {
    setItemAsync: jest.fn().mockImplementation(async (key: string, value: string): Promise<void> => {
      store.set(key, value);
    }),
    getItemAsync: async (key: string): Promise<string | null> => {
      if (key === '___keys___' && getKeysShouldThrow) {
        getKeysShouldThrow = false;
        return Promise.reject(new Error('Keys cannot be retrieved!'));
      }
      return Promise.resolve(store.get(key) ?? null);
    },
    deleteItemAsync: jest.fn().mockImplementation(async (key: string): Promise<void> => {
      store.delete(key);
    }),
    _makeNextGetKeysThrow(): void {
      getKeysShouldThrow = true;
    },
  };
});

describe('SyncSecureStorage', () => {
  let storage: SyncSecureStorage;

  beforeAll(async () => {
    storage = new SyncSecureStorage();
    await storage.getInitPromise();
  });

  test('storage.key() returns null', async () => {
    expect(storage.key(0)).toStrictEqual(null);
    expect(storage.key(1)).toStrictEqual(null);
  });

  test('removeItem -- setKeys = true', async () => {
    await SecureStore.setItemAsync('bestEhr', 'medplum');
    await expect(SecureStore.getItemAsync('bestEhr')).resolves.toStrictEqual('medplum');
    storage.removeItem('bestEhr', true);
    await sleep(25);
    await expect(SecureStore.getItemAsync('bestEhr')).resolves.toStrictEqual(null);
  });

  test.each(['', null])('setItem -- empty value', async (value) => {
    await SecureStore.setItemAsync('bestEhr', 'medplum');
    await expect(SecureStore.getItemAsync('bestEhr')).resolves.toStrictEqual('medplum');
    storage.setItem('bestEhr', value);
    await sleep(25);
    await expect(SecureStore.getItemAsync('bestEhr')).resolves.toStrictEqual(null);
  });
});

describe('ExpoClientStorage', () => {
  let clientStorage: ExpoClientStorage;

  test('Using storage before initialized should throw', () => {
    clientStorage = new ExpoClientStorage();
    if (Platform.OS !== 'web') {
      expect(() => clientStorage.getObject('test')).toThrow();
    }
  });

  test('Waiting for initialized', async () => {
    await clientStorage.getInitPromise();
    expect(() => clientStorage.getObject('test')).not.toThrow();
  });

  test('Setting an string', async () => {
    clientStorage.setString('bestEhr', 'medplum');
    expect(clientStorage.length).toBeDefined();
    expect(clientStorage.length).toBe(1);
  });

  test('Getting a string', () => {
    expect(clientStorage.getString('bestEhr')).toStrictEqual('medplum');
  });

  test('Setting an object', async () => {
    clientStorage.setObject('bestEhr', { med: 'plum' });
    expect(clientStorage.length).toBeDefined();
    expect(clientStorage.length).toBe(1);
  });

  test('Getting an object', () => {
    expect(clientStorage.getObject('bestEhr')).toStrictEqual({ med: 'plum' });
  });

  test('Making a new storage should fetch existing keys', async () => {
    const newStorage = new ExpoClientStorage();
    await newStorage.getInitPromise();
    // Assert size
    expect(newStorage.length).toStrictEqual(1);
  });

  test('Clearing storage should empty it', () => {
    clientStorage.clear();
    expect(clientStorage.length).toStrictEqual(0);
  });

  test('After clearing, new storages should not get previous keys', async () => {
    const newStorage = new ExpoClientStorage();
    await newStorage.getInitPromise();
    // Assert size is 0
    expect(newStorage.length).toStrictEqual(0);
  });

  test('Setting a key to a value larger than max (2000)', async () => {
    const firstStorage = new ExpoClientStorage();
    await firstStorage.getInitPromise();

    const test1Str = 'Hello, world!'.repeat(200);
    expect(test1Str.length).toStrictEqual(2600);

    firstStorage.setString('test1', test1Str);
    expect(firstStorage.getString('test1')).toStrictEqual(test1Str);
    await sleep(100);

    const test2Str = test1Str.repeat(3);
    expect(test2Str.length).toStrictEqual(2600 * 3);

    firstStorage.setString('test2', test2Str);
    expect(firstStorage.getString('test2')).toStrictEqual(test2Str);
    await sleep(100);

    const newStorage = new ExpoClientStorage();
    await newStorage.getInitPromise();

    expect(newStorage.getString('test1')).toStrictEqual(test1Str);
    expect(newStorage.getString('test2')).toStrictEqual(test2Str);
  });

  if (Platform.OS !== 'web') {
    test('If an error is thrown while getting keys, should call delete and init anyways', async () => {
      // Clear keys before this test
      await SecureStore.deleteItemAsync('___keys___');

      // Setup, pre-init with keys
      const storage1 = new ExpoClientStorage();
      await expect(storage1.getInitPromise()).resolves.toBeUndefined();
      storage1.setString('bestEhr', 'medplum');
      expect(storage1.length).toStrictEqual(1);

      // Sleep for a bit to let async stuff settle
      await sleep(25);

      const storage2 = new ExpoClientStorage();
      await expect(storage2.getInitPromise()).resolves.toBeUndefined();
      expect(storage2.length).toStrictEqual(1);
      expect(storage2.getString('bestEhr')).toStrictEqual('medplum');

      const originalError = console.error;
      console.error = jest.fn();

      // @ts-expect-error This function is only exported for testing
      SecureStore._makeNextGetKeysThrow();

      const storage3 = new ExpoClientStorage();
      await expect(storage3.getInitPromise()).resolves.toBeUndefined();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('___keys___');

      // Assert size is 0 and key is undefined
      expect(storage3.length).toStrictEqual(0);
      expect(storage3.getString('bestEhr')).toBeUndefined();

      expect(console.error).toHaveBeenCalledTimes(1);
      console.error = originalError;
    });
  }
});
