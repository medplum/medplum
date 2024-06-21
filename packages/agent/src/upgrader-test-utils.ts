import type { ReleaseManifest } from './upgrader-utils';

export function mockFetchForUpgrader(version?: string): jest.SpyInstance {
  let count = 0;

  const manifest = {
    tag_name: `v${version ?? '3.1.6'}`,
    assets: [
      {
        name: `medplum-agent-${version ?? '3.1.6'}-linux'`,
        browser_download_url: 'https://example.com/linux',
      },
      {
        name: `medplum-agent-installer-${version ?? '3.1.6'}-windows.exe`,
        browser_download_url: 'https://example.com/win32',
      },
    ],
  } satisfies ReleaseManifest;

  return jest.spyOn(globalThis, 'fetch').mockImplementation(
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
