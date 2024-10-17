import { GITHUB_RELEASES_URL, ReleaseManifest, clearReleaseCache } from '@medplum/core';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import { downloadRelease, getReleaseBinPath, parseDownloadUrl } from './upgrader-utils';

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
