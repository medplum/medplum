// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ReleaseManifest } from '@medplum/core';
import type { MockInstance } from 'vitest';

/**
 * Builds a mock {@link ReleaseManifest} for the given version, with both a Linux and Windows asset.
 *
 * Mirrors the real releases server: the manifest returned for `vX.Y.Z.json` is tagged `vX.Y.Z`.
 * Hardcoding a single tag would otherwise mismatch the requested version and break the
 * version-keyed cache in `fetchVersionManifest` (the cache is stored under the resolved `tag_name`).
 *
 * @param version - The release version the manifest should describe (e.g. `4.2.4`).
 * @returns A `ReleaseManifest` tagged `v${version}` with Linux and Windows assets.
 */
export function buildManifest(version: string): ReleaseManifest {
  return {
    tag_name: `v${version}`,
    assets: [
      {
        name: `medplum-agent-${version}-linux`,
        browser_download_url: 'https://example.com/linux',
      },
      {
        name: `medplum-agent-installer-${version}-windows.exe`,
        browser_download_url: 'https://example.com/win32',
      },
    ],
  } satisfies ReleaseManifest;
}

export function mockFetchForUpgrader(version?: string): MockInstance<typeof fetch> {
  let count = 0;

  const defaultVersion = version ?? '4.2.4';

  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      if (!(typeof input === 'string' || input instanceof URL)) {
        throw new Error('input must be a string or URL object');
      }
      return new Promise<Response>((resolve) => {
        switch (count) {
          case 0: {
            count++;
            // Resolve the version from the requested URL (`.../vX.Y.Z.json` or `.../latest.json`)
            // so the returned `tag_name` matches what was asked for.
            const url = input.toString();
            const match = /\/v(\d+\.\d+\.\d+)\.json/.exec(url);
            const resolvedVersion = match ? match[1] : defaultVersion;
            resolve(
              new Response(JSON.stringify(buildManifest(resolvedVersion)), {
                headers: { 'content-type': 'application/json' },
                status: 200,
              })
            );
            break;
          }
          case 1:
            count++;
            resolve(
              new Response(createMockReadableStream('Hello', ', ', 'Medplum!'), {
                status: 200,
                headers: { 'content-type': 'application/octet-stream' },
              })
            );
            break;
          default:
            throw new Error('Too many calls');
        }
      });
    })
  );
}

function createMockReadableStream(...chunks: string[]): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const textEncoder = new TextEncoder();
      const encodedChunks: Uint8Array[] = chunks.map((chunk) => {
        return textEncoder.encode(chunk);
      });

      let streamIdx = 0;

      // The following function handles each data chunk
      function push(): void {
        if (streamIdx === encodedChunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(encodedChunks[streamIdx]);
        streamIdx++;
        push();
      }

      push();
    },
  });
}
