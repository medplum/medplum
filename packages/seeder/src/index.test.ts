import { MedplumClient } from '@medplum/core';
import { setup } from './index';

test('Seeder completes successfully', async (done) => {
  const client = new MedplumClient({
    baseUrl: 'http://localhost:5000/fhir/R4/',
    clientId: 'abc',
    fetch: async (url: string, options?: any) => {
      return Promise.resolve({
        json: async () => {
          return Promise.resolve({
            id: '123'
          });
        }
      });
    }
  });

  await setup(client);
  done();
});
