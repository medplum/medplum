// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { vi } from 'vitest';
import { MEDPLUM_VERSION } from './client';
import type { ReleaseManifest } from './version-utils';
import {
  assertReleaseManifest,
  checkIfValidMedplumVersion,
  clearReleaseCache,
  compareVersions,
  fetchAllVersionStrings,
  fetchLatestVersionString,
  fetchVersionManifest,
  isValidMedplumSemver,
  MEDPLUM_RELEASES_URL,
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
  ).toThrow("Manifest missing valid tag_name starting with a 'v' (eg. v5.1.15)");
  expect(() =>
    assertReleaseManifest({
      tag_name: '3.1.6',
      assets: [{ name: 'medplum-agent-3.1.6-linux', browser_download_url: 'https://example.com' }],
    })
  ).toThrow("Manifest missing valid tag_name starting with a 'v' (eg. v5.1.15)");
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
    globalThis.fetch = vi.fn();
  });

  beforeEach(() => {
    clearReleaseCache();
  });

  test('Invalid version format', async () => {
    await expect(checkIfValidMedplumVersion('test', '3.1.6-alpha')).resolves.toStrictEqual(false);
  });

  test('Version not found', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
        return Promise.reject(new Error('Network error'));
      })
    );
    await expect(checkIfValidMedplumVersion('test', '3.1.8')).resolves.toStrictEqual(false);
    fetchSpy.mockRestore();
  });
});

test('compareVersions', () => {
  expect(compareVersions('1.2.3', '1.2.3')).toStrictEqual(0);
  expect(compareVersions('1.2.4', '1.2.3')).toBeGreaterThan(0);
  expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
  expect(compareVersions('1.3.0', '1.2.9')).toBeGreaterThan(0);
  expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
  expect(compareVersions('1.2.3-1a2b3c4', '1.2.3')).toStrictEqual(0);
  expect(compareVersions('1.2.10', '1.2.9')).toBeGreaterThan(0);
});

describe('fetchAllVersionStrings', () => {
  beforeEach(() => {
    clearReleaseCache();
  });

  test('Returns versions sorted newest to oldest', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => ({
            versions: [
              { tag_name: 'v3.1.0', version: '3.1.0', published_at: '2024-01-01T00:00:00.000Z' },
              { tag_name: 'v3.2.14', version: '3.2.14', published_at: '2024-03-01T00:00:00.000Z' },
              { tag_name: 'v3.2.5', version: '3.2.5', published_at: '2024-02-01T00:00:00.000Z' },
            ],
          }),
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchAllVersionStrings('test')).resolves.toStrictEqual(['3.2.14', '3.2.5', '3.1.0']);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining(`${MEDPLUM_RELEASES_URL}/all.json`));
    fetchSpy.mockRestore();
  });

  test('Filters out invalid version strings', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => ({
            versions: [
              { tag_name: 'v3.1.0', version: '3.1.0', published_at: '2024-01-01T00:00:00.000Z' },
              { tag_name: 'canary', version: 'canary', published_at: '2024-02-01T00:00:00.000Z' },
            ],
          }),
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchAllVersionStrings('test')).resolves.toStrictEqual(['3.1.0']);
    fetchSpy.mockRestore();
  });

  test('Fetch fails with non-200 status', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
        return Promise.resolve({
          status: 500,
          json: async () => ({ message: 'Internal Server Error' }),
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchAllVersionStrings('test')).rejects.toThrow(
      'Received status code 500 while fetching all release versions'
    );
    await expect(fetchAllVersionStrings('test')).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'Internal Server Error' }),
    });
    fetchSpy.mockRestore();
  });

  test('Fetch throws -- Network error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
        return Promise.reject(new Error('Network request failed'));
      })
    );
    await expect(fetchAllVersionStrings('test')).rejects.toThrow('Network request failed');
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
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => {
            return manifest;
          },
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchVersionManifest('test')).resolves.toMatchObject(manifest);
    // Should be called with latest
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.stringContaining(`${MEDPLUM_RELEASES_URL}/latest.json`));
    // Call again to make sure `latest` is NOT cached and gets refetched
    fetchSpy.mockClear();
    await expect(fetchVersionManifest('test')).resolves.toMatchObject(manifest);
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.stringContaining(`${MEDPLUM_RELEASES_URL}/latest.json`));
    fetchSpy.mockRestore();
  });

  test('Latest resolves and caches the concrete version', async () => {
    const manifest = {
      tag_name: 'v3.1.6',
      assets: [
        {
          name: 'medplum-agent-3.1.6-linux',
          browser_download_url: 'https://example.com',
        },
      ],
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => {
            return manifest;
          },
        });
      }) as unknown as typeof globalThis.fetch
    );
    // Fetching latest resolves to v3.1.6 and caches that concrete version
    await expect(fetchVersionManifest('test')).resolves.toMatchObject(manifest);
    // Requesting the concrete version should be served from cache, no refetch
    fetchSpy.mockClear();
    await expect(fetchVersionManifest('test', '3.1.6')).resolves.toMatchObject(manifest);
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
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => {
            return manifest;
          },
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchVersionManifest('test', '3.1.6')).resolves.toMatchObject(manifest);
    // Should be called with version
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.stringContaining(`${MEDPLUM_RELEASES_URL}/v3.1.6.json`));
    // Call again to make sure we don't refetch
    fetchSpy.mockClear();
    await expect(fetchVersionManifest('test', '3.1.6')).resolves.toMatchObject(manifest);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('Fetch throws -- Network error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
        return Promise.reject(new Error('Network request failed'));
      })
    );
    await expect(fetchVersionManifest('test', '3.1.6')).rejects.toThrow('Network request failed');
    fetchSpy.mockRestore();
  });

  test('Version not found', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
        return Promise.resolve({
          status: 404,
          json: async () => {
            return { message: 'Not Found' };
          },
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchVersionManifest('test', '3.1.6')).rejects.toThrow(
      "Received status code 404 while fetching manifest for version '3.1.6'"
    );
    await expect(fetchVersionManifest('test', '3.1.6')).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'Not Found' }),
    });
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
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
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
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => {
            return manifest;
          },
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchLatestVersionString('test')).rejects.toThrow(
      "Manifest missing valid tag_name starting with a 'v' (eg. v5.1.15)"
    );
    fetchSpy.mockRestore();
  });
});

describe('warnIfNewerVersionAvailable', () => {
  beforeEach(() => {
    clearReleaseCache();
  });

  test('Newer version available', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => ({
        status: 200,
        json: async () => ({ tag_name: 'v100.0.0', assets: [{ name: 'x', browser_download_url: 'x' }] }),
      })) as unknown as typeof globalThis.fetch
    );

    console.warn = vi.fn();
    await warnIfNewerVersionAvailable('test', { foo: 'bar' });
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining(`${MEDPLUM_RELEASES_URL}/latest.json`));
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('A new version (v100.0.0) of Medplum is available.')
    );
    fetchSpy.mockRestore();
  });

  test('On current version', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => ({
        status: 200,
        json: async () => ({ tag_name: 'v' + MEDPLUM_VERSION, assets: [{ name: 'x', browser_download_url: 'x' }] }),
      })) as unknown as typeof globalThis.fetch
    );

    console.warn = vi.fn();
    await warnIfNewerVersionAvailable('test');
    expect(console.warn).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('On current version', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async () => {
        throw new Error('Network error');
      })
    );

    console.warn = vi.fn();
    await warnIfNewerVersionAvailable('test');
    expect(console.warn).toHaveBeenCalledWith('Failed to check for newer version: Network error');
    fetchSpy.mockRestore();
  });
});
