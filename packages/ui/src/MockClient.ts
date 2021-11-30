import { MedplumClient, Practitioner } from '@medplum/core';

export class MockClient extends MedplumClient {

  constructor(routes: Record<string, Record<string, any>>) {
    super({
      baseUrl: 'https://example.com/',
      clientId: 'my-client-id',
      fetch: (url: string, options: any) => {
        const method = options.method;
        const path = url.replace('https://example.com/', '');

        let result = routes[path]?.[method];
        if (typeof result === 'function') {
          result = result(options.body);
        }

        const response: any = {
          request: {
            url,
            options
          },
          ...result
        };

        return Promise.resolve({
          json: () => Promise.resolve(response)
        });
      }
    });
  }

  getProfile() {
    return {
      resourceType: 'Practitioner',
      id: '123',
      meta: {
        versionId: '456'
      }
    } as Practitioner;
  }
}
