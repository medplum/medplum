import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import fs from 'node:fs';
import { printConfigNotFound, printStackNotFound } from './utils';

jest.mock('node:fs', () => ({
  createReadStream: jest.fn(),
  existsSync: jest.fn(),
  mkdtempSync: jest.fn(() => '/tmp/'),
  readdirSync: jest.fn(() => []),
  readFileSync: jest.fn(),
  rmSync: jest.fn(),
  writeFileSync: jest.fn(),
  constants: {
    O_CREAT: 0,
  },
  promises: {
    readFile: jest.fn(async () => '{}'),
  },
}));

describe('Utils', () => {
  test('printConfigNotFound no configs found', async () => {
    (fs.readdirSync as jest.Mock).mockImplementation(() => [
      { name: 'js', isDirectory: () => true, isFile: () => false },
      { name: 'main.js', isDirectory: () => false, isFile: () => true },
      { name: 'nonejsfile', isDirectory: () => false, isFile: () => true },
    ]);

    console.log = jest.fn();

    await printConfigNotFound('dev');

    expect(console.log).toHaveBeenCalledWith('Config not found: dev (medplum.dev.config.json)');
    expect(console.log).toHaveBeenCalledWith('No configs found');
  });

  test('printConfigNotFound configs found', async () => {
    (fs.readdirSync as jest.Mock).mockImplementation(() => [
      { name: 'medplum.x.config.json', isDirectory: () => false, isFile: () => true },
      { name: 'medplum.y.config.json', isDirectory: () => false, isFile: () => true },
      { name: 'medplum.z.config.json', isDirectory: () => false, isFile: () => true },
    ]);

    console.log = jest.fn();

    await printConfigNotFound('dev');

    expect(console.log).toHaveBeenCalledWith('Config not found: dev (medplum.dev.config.json)');
    expect(console.log).toHaveBeenCalledWith('Available configs:');
  });

  test('printStackNotFound success', async () => {
    const stsClient = mockClient(STSClient);

    stsClient.on(GetCallerIdentityCommand).resolves({
      Arn: 'arn:aws:iam::123456789012:user/medplum',
      Account: '111111111111',
      UserId: '222222222222',
    });

    console.log = jest.fn();

    await printStackNotFound('dev');

    expect(console.log).toHaveBeenCalledWith('Stack not found: dev');
    expect(console.log).toHaveBeenCalledWith('AWS Account ID:    ', '111111111111');
    expect(console.log).toHaveBeenCalledWith('AWS Account ARN:   ', 'arn:aws:iam::123456789012:user/medplum');
    expect(console.log).toHaveBeenCalledWith('AWS User ID:       ', '222222222222');
  });

  test('printStackNotFound failure', async () => {
    const stsClient = mockClient(STSClient);

    stsClient.on(GetCallerIdentityCommand).rejects(new Error('Not authorized'));

    console.log = jest.fn();

    await printStackNotFound('dev');

    expect(console.log).toHaveBeenCalledWith('Stack not found: dev');
    expect(console.log).toHaveBeenCalledWith('Warning: Unable to get AWS account ID', 'Not authorized');
  });
});
