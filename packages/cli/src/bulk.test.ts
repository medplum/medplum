import { ContentType, created, MedplumClient } from '@medplum/core';
import { main } from '.';
import { createMedplumClient } from './util/client';
import { getUnsupportedExtension } from './utils';

const testLineOutput = [
  `{"resourceType":"Patient", "id":"1111111"}`,
  `{"resourceType":"Patient", "id":"2222222"}`,
  `{"resourceType":"Patient", "id":"3333333"}`,
  `{"resourceType":"ExplanationOfBenefit", "id":"1111111", "item":[{"sequence": 1}]}`, // EOB with missing provider and item.productOrService
  `{"resourceType":"ExplanationOfBenefit", "id":"2222222", "provider": "someprovider", "item":[{"sequence": 1, "productOrService": "someproduct"}]}`,
];
jest.mock('./util/client');
jest.mock('node:child_process');
jest.mock('node:http');
jest.mock('node:readline', () => ({
  createInterface: jest.fn().mockReturnValue({
    [Symbol.asyncIterator]: jest.fn(function* () {
      for (const line of testLineOutput) {
        yield line;
      }
    }),
  }),
}));

jest.mock('node:fs', () => ({
  createReadStream: jest.fn(),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  writeFile: jest.fn((path, data, callback) => {
    callback();
  }),
  constants: {
    O_CREAT: 0,
  },
  promises: {
    readFile: jest.fn(async () => '{}'),
  },
}));

let medplum: MedplumClient;

describe('CLI Bulk Commands', () => {
  describe('export', () => {
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
      jest.resetModules();
      jest.clearAllMocks();
      medplum = new MedplumClient({ fetch });

      (createMedplumClient as unknown as jest.Mock).mockImplementation(async () => medplum);

      console.log = jest.fn();
      console.error = jest.fn();
      process.exit = jest.fn() as never;
    });

    test('system', async () => {
      const medplumDownloadSpy = jest.spyOn(medplum, 'download').mockImplementation((): any => {
        return {
          text: jest.fn(),
        };
      });
      await main(['node', 'index.js', 'bulk', 'export', '-t', 'Patient']);
      expect(medplumDownloadSpy).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringMatching(
          'ProjectMembership_storage_20fabdd3_e036_49fc_9260_8a30eaffefb1_498475fe_5eb0_46e5_b9f4_b46943c9719b.ndjson is created'
        )
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringMatching('Project_data_55555_aaaaaa_bbbbb_ccc_ddddd_eeeeee_ndjson.ndjson is created')
      );
    });

    test('with --target-directory', async () => {
      const medplumDownloadSpy = jest.spyOn(medplum, 'download').mockImplementation((): any => {
        return {
          text: jest.fn(),
        };
      });
      const testDirectory = 'testtargetdirectory';
      await main(['node', 'index.js', 'bulk', 'export', '-t', 'Patient', '--target-directory', testDirectory]);
      expect(medplumDownloadSpy).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(`${testDirectory}`));
    });
  });

  describe('import', () => {
    let fetch: any;

    beforeEach(() => {
      console.log = jest.fn();
      console.error = jest.fn();
      jest.resetModules();
      jest.clearAllMocks();
      fetch = jest.fn(async () => {
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
            resourceType: 'Bundle',
            type: 'transaction-response',
            entry: [
              {
                response: {
                  outcome: created,
                  status: '201',
                },
                resource: {
                  resourceType: 'QuestionnaireResponse',
                },
              },
            ],
          })),
        };
      });
      medplum = new MedplumClient({ fetch });
      (createMedplumClient as unknown as jest.Mock).mockImplementation(async () => medplum);
    });

    test('success', async () => {
      await main(['node', 'index.js', 'bulk', 'import', 'Patient.json']);

      testLineOutput.forEach((line) => {
        const resource = JSON.parse(line);
        expect(fetch).toHaveBeenCalledWith(
          expect.stringMatching(`/fhir/R4`),
          expect.objectContaining({
            body: expect.stringContaining(
              JSON.stringify({
                resource: resource,
                request: {
                  method: 'POST',
                  url: resource.resourceType,
                },
              })
            ),
          })
        );
      });
      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(`"status": "201"`));
      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(`"text": "Created"`));
    });

    test('success with option --num-resources-per-request', async () => {
      await main(['node', 'index.js', 'bulk', 'import', 'Patient.json', '--num-resources-per-request', '1']);

      testLineOutput.forEach((line) => {
        const resource = JSON.parse(line);
        expect(fetch).toHaveBeenCalledWith(
          expect.stringMatching(`/fhir/R4`),
          expect.objectContaining({
            body: expect.stringContaining(
              JSON.stringify({
                resource: resource,
                request: {
                  method: 'POST',
                  url: resource.resourceType,
                },
              })
            ),
          })
        );
      });

      expect(fetch).toHaveBeenCalled();
    });

    test('success with option --target-directory', async () => {
      await main(['node', 'index.js', 'bulk', 'import', 'Patient.json', '--target-directory', 'testdirectory']);

      testLineOutput.forEach((line) => {
        const resource = JSON.parse(line);
        expect(fetch).toHaveBeenCalledWith(
          expect.stringMatching(`/fhir/R4`),
          expect.objectContaining({
            body: expect.stringContaining(
              JSON.stringify({
                resource: resource,
                request: {
                  method: 'POST',
                  url: resource.resourceType,
                },
              })
            ),
          })
        );
      });

      expect(fetch).toHaveBeenCalled();
    });

    test('success with option --add-extensions-for-missing-values', async () => {
      await main(['node', 'index.js', 'bulk', 'import', 'file.json', '--add-extensions-for-missing-values']);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(`/fhir/R4`),
        expect.objectContaining({
          body: expect.stringContaining(`"resourceType":"ExplanationOfBenefit","id":"1111111"`),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(`/fhir/R4`),
        expect.objectContaining({
          body: expect.stringContaining(`"provider":` + JSON.stringify(getUnsupportedExtension())),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(`/fhir/R4`),
        expect.objectContaining({
          body: expect.stringContaining(`"productOrService":` + JSON.stringify(getUnsupportedExtension())),
        })
      );

      expect(fetch).toHaveBeenCalled();
    });
  });
});
