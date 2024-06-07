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
        browser_download_url: 'https://example.com/windows',
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
}
