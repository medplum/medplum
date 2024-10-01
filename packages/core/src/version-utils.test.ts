import {
  assertReleaseManifest,
  checkIfValidMedplumVersion,
  clearReleaseCache,
  fetchLatestVersionString,
  fetchVersionManifest,
  GITHUB_RELEASES_URL,
  isValidMedplumSemver,
  ReleaseManifest,
} from './version-utils';

test('isValidMedplumSemver', () => {
  expect(isValidMedplumSemver('1.2.3')).toEqual(true);
  expect(isValidMedplumSemver('1.2')).toEqual(false);
  expect(isValidMedplumSemver('1.2.-')).toEqual(false);
  expect(isValidMedplumSemver('.2.3')).toEqual(false);
  expect(isValidMedplumSemver('10.256.121212')).toEqual(true);
  expect(isValidMedplumSemver('10.256.121212-alpha')).toEqual(false);
  expect(isValidMedplumSemver('10.256.121212-1012')).toEqual(false);
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
    await expect(checkIfValidMedplumVersion('3.1.6-alpha')).resolves.toEqual(false);
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

    await expect(checkIfValidMedplumVersion('3.1.8')).resolves.toEqual(false);
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
      jest.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => {
            return manifest;
          },
        });
      }) as unknown as typeof globalThis.fetch
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
      jest.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => {
            return manifest;
          },
        });
      }) as unknown as typeof globalThis.fetch
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
      jest.fn(async () => {
        return Promise.resolve({
          status: 404,
          json: async () => {
            return { message: 'Not Found' };
          },
        });
      }) as unknown as typeof globalThis.fetch
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
      jest.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => {
            return manifest;
          },
        });
      }) as unknown as typeof globalThis.fetch
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
      jest.fn(async () => {
        return Promise.resolve({
          status: 200,
          json: async () => {
            return manifest;
          },
        });
      }) as unknown as typeof globalThis.fetch
    );
    await expect(fetchLatestVersionString()).rejects.toThrow(
      "Invalid release name found. Release tag 'canary' did not start with 'v'"
    );
    fetchSpy.mockRestore();
  });
});
