import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import {
  GITHUB_RELEASES_URL,
  ReleaseManifest,
  assertReleaseManifest,
  checkIfValidMedplumVersion,
  clearReleaseCache,
  downloadRelease,
  fetchLatestVersionString,
  fetchVersionManifest,
  getReleaseBinPath,
  isValidSemver,
  parseDownloadUrl,
} from './upgrader-utils';

const ALL_PLATFORMS_LIST = ['win32', 'linux', 'darwin'];
const VALID_PLATFORMS_LIST = ['win32', 'linux'];

describe.each(ALL_PLATFORMS_LIST)('Upgrader Utils -- All Platforms -- %s', (_platform) => {
  let platformSpy: jest.SpyInstance;

  beforeEach(() => {
    // @ts-expect-error Platform type is not exported
    platformSpy = jest.spyOn(os, 'platform').mockImplementation(() => _platform);
  });

  afterEach(() => {
    platformSpy.mockRestore();
  });

  test('isValidSemver', () => {
    expect(isValidSemver('1.2.3')).toEqual(true);
    expect(isValidSemver('1.2')).toEqual(false);
    expect(isValidSemver('1.2.-')).toEqual(false);
    expect(isValidSemver('.2.3')).toEqual(false);
    expect(isValidSemver('10.256.121212')).toEqual(true);
    expect(isValidSemver('10.256.121212-alpha')).toEqual(false);
    expect(isValidSemver('10.256.121212-1012')).toEqual(false);
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
    beforeEach(() => {
      clearReleaseCache();
    });

    test('Invalid version format', async () => {
      await expect(checkIfValidMedplumVersion('3.1.6-alpha')).resolves.toEqual(false);
    });

    test('Version not found', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
        // @ts-expect-error Not perfect match to fetch
        jest.fn(async () => {
          return Promise.resolve({
            status: 404,
            json: async () => {
              return { message: 'Not Found' };
            },
          });
        })
      );

      await expect(checkIfValidMedplumVersion('3.1.8')).resolves.toEqual(false);
      fetchSpy.mockRestore();
    });

    test('Version not found', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
        // @ts-expect-error Not perfect match to fetch
        jest.fn(async () => {
          return Promise.resolve({
            status: 404,
            json: async () => {
              return { message: 'Not Found' };
            },
          });
        })
      );
      await expect(checkIfValidMedplumVersion('3.1.8')).resolves.toEqual(false);
      fetchSpy.mockRestore();
    });

    test('Network error - fetch throws', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
        jest.fn(async () => {
          return Promise.reject(new Error('Network error'));
        })
      );
      await expect(checkIfValidMedplumVersion('3.1.8')).resolves.toEqual(false);
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
        // @ts-expect-error Not perfect match to fetch
        jest.fn(async () => {
          return Promise.resolve({
            status: 200,
            json: async () => {
              return manifest;
            },
          });
        })
      );
      await expect(fetchVersionManifest()).resolves.toMatchObject<ReleaseManifest>(manifest);
      // Should be called with latest
      expect(fetchSpy).toHaveBeenLastCalledWith(`${GITHUB_RELEASES_URL}/latest`);
      // Call again to make sure we don't refetch
      fetchSpy.mockClear();
      await expect(fetchVersionManifest()).resolves.toMatchObject<ReleaseManifest>(manifest);
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
        // @ts-expect-error Not perfect match to fetch
        jest.fn(async () => {
          return Promise.resolve({
            status: 200,
            json: async () => {
              return manifest;
            },
          });
        })
      );
      await expect(fetchVersionManifest('3.1.6')).resolves.toMatchObject<ReleaseManifest>(manifest);
      // Should be called with latest
      expect(fetchSpy).toHaveBeenLastCalledWith(`${GITHUB_RELEASES_URL}/tags/v3.1.6`);
      // Call again to make sure we don't refetch
      fetchSpy.mockClear();
      await expect(fetchVersionManifest('3.1.6')).resolves.toMatchObject<ReleaseManifest>(manifest);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    test('Fetch throws -- Network error', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
        jest.fn(async () => {
          return Promise.reject(new Error('Network request failed'));
        })
      );
      await expect(fetchVersionManifest('3.1.6')).rejects.toThrow('Network request failed');
      fetchSpy.mockRestore();
    });

    test('Version not found', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
        // @ts-expect-error Not perfect match to fetch
        jest.fn(async () => {
          return Promise.resolve({
            status: 404,
            json: async () => {
              return { message: 'Not Found' };
            },
          });
        })
      );
      await expect(fetchVersionManifest('3.1.6')).rejects.toThrow(
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
        // @ts-expect-error Not perfect match to fetch
        jest.fn(async () => {
          return Promise.resolve({
            status: 200,
            json: async () => {
              return manifest;
            },
          });
        })
      );
      await expect(fetchLatestVersionString()).resolves.toEqual('3.1.6');
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
        // @ts-expect-error Not perfect match to fetch
        jest.fn(async () => {
          return Promise.resolve({
            status: 200,
            json: async () => {
              return manifest;
            },
          });
        })
      );
      await expect(fetchLatestVersionString()).rejects.toThrow(
        "Invalid release name found. Release tag 'canary' did not start with 'v'"
      );
      fetchSpy.mockRestore();
    });
  });

  test('parseDownloadUrl', () => {
    const manifest = {
      tag_name: 'v3.1.6',
      assets: [
        {
          name: 'medplum-agent-3.1.6-linux',
          browser_download_url: 'https://example.com/linux',
        },
        {
          name: 'medplum-agent-installer-3.1.6-windows.exe',
          browser_download_url: 'https://example.com/win32',
        },
      ],
    } satisfies ReleaseManifest;
    expect(parseDownloadUrl(manifest, 'win32')).toEqual('https://example.com/win32');
    expect(parseDownloadUrl(manifest, 'linux')).toEqual('https://example.com/linux');
    expect(() => parseDownloadUrl(manifest, 'darwin')).toThrow('Unsupported platform: darwin');
  });

  test('getReleaseBinPath', () => {
    switch (_platform) {
      case 'win32':
        expect(getReleaseBinPath('3.1.6')).toEqual(resolve(__dirname, 'medplum-agent-installer-3.1.6.exe'));
        break;
      case 'linux':
        expect(getReleaseBinPath('3.1.6')).toEqual(resolve(__dirname, 'medplum-agent-3.1.6-linux'));
        break;
      default:
        expect(() => getReleaseBinPath('3.1.6')).toThrow('Unsupported platform: darwin');
    }
  });
});

describe.each(VALID_PLATFORMS_LIST)('Upgrader Utils -- Valid Platforms -- %s', (_platform) => {
  let platformSpy: jest.SpyInstance;

  beforeAll(() => {
    // @ts-expect-error Platform type is not exported
    platformSpy = jest.spyOn(os, 'platform').mockImplementation(() => _platform);
  });

  afterEach(() => {
    platformSpy.mockRestore();
  });

  describe('downloadRelease', () => {
    beforeAll(() => {
      if (!existsSync(resolve(__dirname, 'tmp'))) {
        mkdirSync(resolve(__dirname, 'tmp'));
      }
    });

    afterAll(() => {
      rmSync(resolve(__dirname, 'tmp'), { recursive: true, force: true });
    });

    beforeEach(() => {
      clearReleaseCache();
    });

    test('Happy path', async () => {
      const manifest = {
        tag_name: 'v3.1.6',
        assets: [
          {
            name: 'medplum-agent-3.1.6-linux',
            browser_download_url: 'https://example.com/linux',
          },
          {
            name: 'medplum-agent-installer-3.1.6-windows.exe',
            browser_download_url: 'https://example.com/win32',
          },
        ],
      } satisfies ReleaseManifest;

      let count = 0;

      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
        jest.fn(async () => {
          return new Promise((resolve) => {
            switch (count) {
              case 0:
                count++;
                resolve(
                  new Response(JSON.stringify(manifest), {
                    headers: { 'content-type': 'application/json' },
                    status: 200,
                  })
                );
                break;
              case 1:
                count++;
                resolve(
                  new Response(
                    new ReadableStream({
                      start(controller) {
                        const textEncoder = new TextEncoder();
                        const chunks: Uint8Array[] = [
                          textEncoder.encode('Hello'),
                          textEncoder.encode(', '),
                          textEncoder.encode('Medplum!'),
                        ];

                        let streamIdx = 0;

                        // The following function handles each data chunk
                        function push(): void {
                          if (streamIdx === chunks.length) {
                            controller.close();
                            return;
                          }
                          controller.enqueue(chunks[streamIdx]);
                          streamIdx++;
                          push();
                        }

                        push();
                      },
                    }),
                    {
                      status: 200,
                      headers: { 'content-type': 'application/octet-stream' },
                    }
                  )
                );
                break;
              default:
                throw new Error('Too many calls');
            }
          });
        })
      );

      await downloadRelease('3.1.6', resolve(__dirname, 'tmp', 'test-release-binary'));
      expect(fetchSpy).toHaveBeenNthCalledWith(1, `${GITHUB_RELEASES_URL}/tags/v3.1.6`);
      expect(fetchSpy).toHaveBeenLastCalledWith(`https://example.com/${_platform}`);
      expect(readFileSync(resolve(__dirname, 'tmp', 'test-release-binary'), { encoding: 'utf-8' })).toEqual(
        'Hello, Medplum!'
      );

      fetchSpy.mockRestore();
    });
  });
});
