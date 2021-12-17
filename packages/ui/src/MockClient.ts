import { LoginState, MedplumClient, ProfileResource } from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';

export class MockClient extends MedplumClient {
  activeLoginOverride?: LoginState;

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
            options,
          },
          ...result,
        };

        return Promise.resolve({
          json: () => Promise.resolve(response),
        });
      },
    });
  }

  clear(): void {
    super.clear();
    this.activeLoginOverride = undefined;
  }

  getProfile(): ProfileResource {
    return {
      resourceType: 'Practitioner',
      id: '123',
      meta: {
        versionId: '456',
      },
    } as Practitioner;
  }

  setActiveLoginOverride(activeLoginOverride: LoginState): void {
    this.activeLoginOverride = activeLoginOverride;
  }

  getActiveLogin(): LoginState | undefined {
    if (this.activeLoginOverride !== undefined) {
      return this.activeLoginOverride;
    }
    return super.getActiveLogin();
  }
}
