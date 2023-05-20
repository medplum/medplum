import { MedplumClient } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { main } from '.';

jest.mock('child_process');
jest.mock('http');

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  constants: {
    O_CREAT: 0,
  },
  promises: {
    readFile: jest.fn(async () => '{}'),
  },
}));

let medplum: MedplumClient;

describe('CLI Bulk Export', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    medplum = new MockClient();
    console.log = jest.fn();
    console.error = jest.fn();
    process.exit = jest.fn() as never;
  });
  test('system', async () => {
    await main(medplum, ['node', 'index.js', 'bulk-export', '-t="Group"']);
  });
});
