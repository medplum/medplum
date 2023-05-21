import { MedplumClient } from '@medplum/core';
import { main } from '.';

jest.mock('child_process');
jest.mock('http');

jest.mock('fs', () => ({
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

describe('CLI Bulk Export', () => {
  let fetch: any;

  beforeEach(() => {
    let count = 0;
    fetch = jest.fn(async (url) => {
      if (url.includes('/$export?_since=200')) {
        return {
          status: 200,
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
            json: jest.fn(async () => {
              return {};
            }),
          };
        }
      }

      return {
        status: 200,
        json: jest.fn(async () => ({
          transactionTime: '2023-05-18T22:55:31.280Z',
          request: 'https://api.medplum.com/fhir/R4/$export?_type=Observation',
          requiresAccessToken: false,
          output: [
            {
              type: 'ProjectMembership',
              url: 'https://api.medplum.com/storage/TEST',
            },
            {
              type: 'Project',
              url: 'https://api.medplum.com/storage/TEST',
            },
          ],
          error: [],
        })),
      };
    });
    jest.resetModules();
    jest.clearAllMocks();
    medplum = new MedplumClient({ fetch });

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
    await main(medplum, ['node', 'index.js', 'bulk-export', '-t', 'Patient']);
    expect(medplumDownloadSpy).toBeCalled();
    expect(console.log).toBeCalledWith(expect.stringMatching('ProjectMembership.json is created'));
    expect(console.log).toBeCalledWith(expect.stringMatching('Project.json is created'));
  });
});
