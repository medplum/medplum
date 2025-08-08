// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MEDPLUM_VERSION } from './client';
import {
  assertReleaseManifest,
  checkIfValidMedplumVersion,
  clearReleaseCache,
  fetchLatestVersionString,
  fetchVersionManifest,
  isValidMedplumSemver,
  MEDPLUM_RELEASES_URL,
  ReleaseManifest,
  warnIfNewerVersionAvailable,
} from './version-utils';

test('isValidMedplumSemver', () => {
  expect(isValidMedplumSemver('1.2.3')).toStrictEqual(true);
  expect(isValidMedplumSemver('1.2')).toStrictEqual(false);
  expect(isValidMedplumSemver('1.2.-')).toStrictEqual(false);
  expect(isValidMedplumSemver('.2.3')).toStrictEqual(false);
  expect(isValidMedplumSemver('10.256.121212')).toStrictEqual(true);
  expect(isValidMedplumSemver('10.256.121212-alpha')).toStrictEqual(false);
  expect(isValidMedplumSemver('10.256.121212-1012')).toStrictEqual(false);
  expect(isValidMedplumSemver('10.256.121212-1z123a1')).toStrictEqual(true);
  expect(isValidMedplumSemver('10.256.121212-test')).toStrictEqual(false);
});

test('assertReleaseManifest', () => {
  expect(() =>
    assertReleaseManifest({
      tag_name: 'v3.1.6',
      assets: [{ name: 'medplum-agent-3.1.6-linux', browser_download_url: 'https://example.com' }],
    } satisfies ReleaseManifest)
  ).not.toThrow();
  expect(() =>
    assertReleaseManifest({
      assets: [{ name: 'medplum-agent-3.1.6-linux', browser_download_url: 'https://example.com' }],
    })
  ).toThrow('Manifest missing tag_name');
  expect(() =>
    assertReleaseManifest({
      tag_name: 'v3.1.6',
    })
  ).toThrow('Manifest missing assets');
  expect(() =>
    assertReleaseManifest({
      tag_name: 'v3.1.6',
      assets: [],
    })
  ).toThrow('Manifest missing assets');
  expect(() =>
    assertReleaseManifest({
      tag_name: 'v3.1.6',
      assets: [{ name: 'medplum-agent-3.1.6-linux' }],
    })
  ).toThrow('Asset missing browser download URL');
  expect(() =>
    assertReleaseManifest({
      tag_name: 'v3.1.6',
      assets: [{ browser_download_url: 'https://example.com' }],
    })
  ).toThrow('Asset missing name');
});

describe('checkIfValidMedplumVersion', () => {
  beforeAll(() => {
    globalThis.fetch = jest.fn();
  });

  beforeEach(() => {
    clearReleaseCache();
  });

  test('Invalid version format', async () => {
    await expect(checkIfValidMedplumVersion('test', '3.1.6-alpha')).resolves.toStrictEqual(false);
  });

  test('Version not found', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      jest.fn(async () => {
        return Promise.resolve({
          status: 404,
          json: async () => {
            return { message: 'Not Found' };
          },
        });
      }) as unknown as typeof globalThis.fetch
    );

    await expect(checkIfValidMedplumVersion('test', '3.1.8')).resolves.toStrictEqual(false);
    fetchSpy.mockRestore();
  });

  test('Version not found', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      jest.fn(async () => {
        return Promise.resolve({
          status: 404,
          json: async () => {
            return { message: 'Not Found' };
          },
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(checkIfValidMedplumVersion('test', '3.1.8')).resolves.toStrictEqual(false);
    fetchSpy.mockRestore();
  });

  test('Network error - fetch throws', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      jest.fn(async () => {
        return Promise.reject(new Error('Network error'));
      })
    );
    await expect(checkIfValidMedplumVersion('test', '3.1.8')).resolves.toStrictEqual(false);
    fetchSpy.mockRestore();
  });
});

describe('fetchVersionManifest', () => {
  beforeEach(() => {
    clearReleaseCache();
  });

  test('Without version specified', async () => {
    const manifest = {
      tag_name: 'v3.1.6',
      assets: [
        {
          name: 'medplum-agent-3.1.6-linux',
          browser_download_url: 'https://example.com',
        },
      ],
    } as ReleaseManifest;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      jest.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => {
            return manifest;
          },
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchVersionManifest('test')).resolves.toMatchObject<ReleaseManifest>(manifest);
    // Should be called with latest
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.stringContaining(`${MEDPLUM_RELEASES_URL}/latest.json`));
    // Call again to make sure we don't refetch
    fetchSpy.mockClear();
    await expect(fetchVersionManifest('test')).resolves.toMatchObject<ReleaseManifest>(manifest);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('With version specified', async () => {
    const manifest = {
      tag_name: 'v3.1.6',
      assets: [
        {
          name: 'medplum-agent-3.1.6-linux',
          browser_download_url: 'https://example.com',
        },
      ],
    } as ReleaseManifest;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      jest.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => {
            return manifest;
          },
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchVersionManifest('test', '3.1.6')).resolves.toMatchObject<ReleaseManifest>(manifest);
    // Should be called with version
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.stringContaining(`${MEDPLUM_RELEASES_URL}/v3.1.6.json`));
    // Call again to make sure we don't refetch
    fetchSpy.mockClear();
    await expect(fetchVersionManifest('test', '3.1.6')).resolves.toMatchObject<ReleaseManifest>(manifest);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('Fetch throws -- Network error', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      jest.fn(async () => {
        return Promise.reject(new Error('Network request failed'));
      })
    );
    await expect(fetchVersionManifest('test', '3.1.6')).rejects.toThrow('Network request failed');
    fetchSpy.mockRestore();
  });

  test('Version not found', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      jest.fn(async () => {
        return Promise.resolve({
          status: 404,
          json: async () => {
            return { message: 'Not Found' };
          },
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchVersionManifest('test', '3.1.6')).rejects.toThrow(
      "Received status code 404 while fetching manifest for version '3.1.6'. Message: Not Found"
    );
    fetchSpy.mockRestore();
  });
});

describe('fetchLatestVersionString', () => {
  beforeEach(() => {
    clearReleaseCache();
  });

  test('Successful', async () => {
    const manifest = {
      tag_name: 'v3.1.6',
      assets: [
        {
          name: 'medplum-agent-3.1.6-linux',
          browser_download_url: 'https://example.com',
        },
      ],
    } as ReleaseManifest;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      jest.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => {
            return manifest;
          },
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchLatestVersionString('test')).resolves.toStrictEqual('3.1.6');
    fetchSpy.mockRestore();
  });

  test('Invalid latest release', async () => {
    const manifest = {
      tag_name: 'canary',
      assets: [
        {
          name: 'medplum-agent-canary-linux',
          browser_download_url: 'https://example.com',
        },
      ],
    } as ReleaseManifest;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      jest.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => {
            return manifest;
          },
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchLatestVersionString('test')).rejects.toThrow(
      "Invalid release name found. Release tag 'canary' did not start with 'v'"
    );
    fetchSpy.mockRestore();
  });
});

describe('warnIfNewerVersionAvailable', () => {
  beforeEach(() => {
    clearReleaseCache();
  });

  test('Newer version available', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      jest.fn(async () => ({
        status: 200,
        json: async () => ({ tag_name: 'v100.0.0', assets: [{ name: 'x', browser_download_url: 'x' }] }),
      })) as unknown as typeof globalThis.fetch
    );

    console.warn = jest.fn();
    await warnIfNewerVersionAvailable('test', { foo: 'bar' });
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining(`${MEDPLUM_RELEASES_URL}/latest.json`));
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('A new version (v100.0.0) of Medplum is available.')
    );
    fetchSpy.mockRestore();
  });

  test('On current version', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      jest.fn(async () => ({
        status: 200,
        json: async () => ({ tag_name: 'v' + MEDPLUM_VERSION, assets: [{ name: 'x', browser_download_url: 'x' }] }),
      })) as unknown as typeof globalThis.fetch
    );

    console.warn = jest.fn();
    await warnIfNewerVersionAvailable('test');
    expect(console.warn).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('On current version', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      jest.fn(async () => {
        throw new Error('Network error');
      }) as unknown as typeof globalThis.fetch
    );

    console.warn = jest.fn();
    await warnIfNewerVersionAvailable('test');
    expect(console.warn).toHaveBeenCalledWith('Failed to check for newer version: Network error');
    fetchSpy.mockRestore();
  });
});
