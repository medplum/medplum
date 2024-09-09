import { ContentType, MedplumClient } from '@medplum/core';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { sep } from 'node:path';
import { main } from '.';
import { FileSystemStorage } from './storage';
import { createMedplumClient } from './util/client';

jest.mock('node:os');
jest.mock('fast-glob', () => ({
  sync: jest.fn(() => []),
}));
jest.mock('./util/client');
jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  writeFile: jest.fn((path, data, callback) => {
    callback();
  }),
}));

const testHomeDir = mkdtempSync(__dirname + sep + 'storage-');

describe('Profiles', () => {
  beforeEach(async () => {
    console.log = jest.fn();
  });

  let fetch: any;
  beforeEach(() => {
    let count = 0;
    fetch = jest.fn(async (url) => {
      if (url.includes('/$export?_since=200')) {
        return {
          status: 200,
          headers: {
            get(name: string): string | undefined {
              return {
                'content-type': ContentType.FHIR_JSON,
              }[name];
            },
          },
          json: jest.fn(async () => {
            return {
              resourceType: 'OperationOutcome',
              id: 'accepted',
              issue: [
                {
                  severity: 'information',
                  code: 'informational',
                  details: {
                    text: 'Accepted',
                  },
                },
              ],
            };
          }),
        };
      }

      if (url.includes('/$export')) {
        return {
          status: 202,
          json: jest.fn(async () => {
            return {
              resourceType: 'OperationOutcome',
              id: 'accepted',
              issue: [
                {
                  severity: 'information',
                  code: 'informational',
                  details: {
                    text: 'Accepted',
                  },
                },
              ],
            };
          }),
          headers: {
            get(name: string): string | undefined {
              return {
                'content-type': ContentType.FHIR_JSON,
                'content-location': 'bulkdata/id/status',
              }[name];
            },
          },
        };
      }

      if (url.includes('bulkdata/id/status')) {
        if (count < 1) {
          count++;
          return {
            status: 202,
            headers: {
              get(name: string): string | undefined {
                return {
                  'content-type': ContentType.FHIR_JSON,
                }[name];
              },
            },
            json: jest.fn(async () => {
              return {};
            }),
          };
        }
      }

      return {
        status: 200,
        headers: {
          get(name: string): string | undefined {
            return {
              'content-type': ContentType.FHIR_JSON,
            }[name];
          },
        },
        json: jest.fn(async () => ({
          transactionTime: '2023-05-18T22:55:31.280Z',
          request: 'https://api.medplum.com/fhir/R4/$export?_type=Observation',
          requiresAccessToken: false,
          output: [
            {
              type: 'ProjectMembership',
              url: 'https://api.medplum.com/storage/20fabdd3-e036-49fc-9260-8a30eaffefb1/498475fe-5eb0-46e5-b9f4-b46943c9719b?Expires=1685749878&Key-Pair-Id=my-key-id&Signature=PWyrVFf',
            },
            {
              type: 'Project',
              url: 'https://sandbox.bcda.cms.gov/data/55555/aaaaaa-bbbbb-ccc-ddddd-eeeeee.ndjson',
            },
          ],
          error: [],
        })),
      };
    });
  });

  beforeAll(async () => {
    (os.homedir as unknown as jest.Mock).mockReturnValue(testHomeDir);
  });

  afterAll(async () => {
    rmSync(testHomeDir, { recursive: true, force: true });
  });

  test('Profiles', async () => {
    const profileName = 'testProfile';
    const obj = {
      name: profileName,
      authType: 'basic',
      baseUrl: 'https://valid.gov',
      fhirUrlPath: 'api/v2',
      tokenUrl: 'https://validtoken.gov',
    };

    await main([
      'node',
      'index.js',
      'profile',
      'set',
      profileName,
      '--auth-type',
      obj.authType,
      '--base-url',
      obj.baseUrl,
      '--fhir-url-path',
      obj.fhirUrlPath,
      '--token-url',
      obj.tokenUrl,
    ]);

    const storage = new FileSystemStorage(profileName);

    // Describe profile
    await main(['node', 'index.js', 'profile', 'describe', profileName]);
    expect(console.log).toHaveBeenCalledWith(obj);

    // Replace the previous values
    const obj2 = {
      name: profileName,
      authType: 'jwt-bearer',
      baseUrl: 'https://valid2.gov',
      fhirUrlPath: 'api/v2',
      tokenUrl: 'https://validtoken2.gov',
    };

    await main([
      'node',
      'index.js',
      'profile',
      'set',
      profileName,
      '--auth-type',
      obj2.authType,
      '--base-url',
      obj2.baseUrl,
      '--fhir-url-path',
      obj2.fhirUrlPath,
      '--token-url',
      obj2.tokenUrl,
    ]);
    expect(storage.getObject('options')).not.toEqual(obj);
    expect(storage.getObject('options')).toEqual(obj2);

    // Add another profile
    const profileName2 = 'testProfile2';
    await main([
      'node',
      'index.js',
      'profile',
      'set',
      profileName2,
      '--auth-type',
      obj.authType,
      '--base-url',
      obj.baseUrl,
      '--fhir-url-path',
      obj.fhirUrlPath,
      '--token-url',
      obj.tokenUrl,
    ]);
    const storage2 = new FileSystemStorage(profileName2);
    expect(storage2.getObject('options')).toEqual({ ...obj, name: profileName2 });

    // List the 2 profiles
    await main(['node', 'index.js', 'profile', 'list']);
    expect(console.log).toHaveBeenCalledWith([
      { profileName, profile: { ...obj2, name: profileName } },
      { profileName: profileName2, profile: { ...obj, name: profileName2 } },
    ]);

    // Delete the first profile
    await main(['node', 'index.js', 'profile', 'remove', profileName]);

    // ProfileName should be undefined, but profileName2 should still exist
    await main(['node', 'index.js', 'profile', 'list']);
    expect(console.log).toHaveBeenCalledWith([{ profileName: profileName2, profile: { ...obj, name: profileName2 } }]);
  });

  test('Basic Auth profile bulk export', async () => {
    const profileName = 'testProfile';
    const obj = {
      authType: 'basic',
      baseUrl: 'https://valid.gov',
      fhirUrlPath: 'api/v2',
      tokenUrl: 'https://validtoken.gov',
      clientId: 'validClientId',
      clientSecret: 'validClientSecret',
    };
    const storage = new FileSystemStorage(profileName);
    storage.setObject('options', obj);

    const medplum = new MedplumClient({ fetch });
    medplum.setBasicAuth(obj.clientId, obj.clientSecret);
    (createMedplumClient as unknown as jest.Mock).mockImplementation(async () => medplum);

    const medplumDownloadSpy = jest.spyOn(medplum, 'download').mockImplementation((): any => {
      return {
        text: jest.fn(),
      };
    });

    await main(['node', 'index.js', 'bulk', 'export', '-e', 'Patient', '-p', profileName]);

    expect(medplumDownloadSpy).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(
        'ProjectMembership_storage_20fabdd3_e036_49fc_9260_8a30eaffefb1_498475fe_5eb0_46e5_b9f4_b46943c9719b.ndjson is created'
      )
    );
  });
});
