import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { randomUUID } from 'crypto';
import { unlinkSync, writeFileSync } from 'fs';
import readline from 'readline';
import { main } from '../index';
import { getConfigFileName } from '../utils';
import { mockReadline } from './test.utils';

jest.mock('readline');

describe('update-config command', () => {
  beforeEach(() => {
    const ssmClient = mockClient(SSMClient);
    ssmClient.on(GetParameterCommand).rejects({ name: 'ParameterNotFound' });
    ssmClient.on(PutParameterCommand).resolves({});
  });

  test('Not found', async () => {
    console.log = jest.fn();

    const tag = randomUUID();

    readline.createInterface = jest.fn(() => mockReadline());

    await main(['node', 'index.js', 'aws', 'update-config', tag]);

    expect(console.log).toHaveBeenCalledWith(`Configuration file ${getConfigFileName(tag)} not found`);
  });

  test('Infra only success', async () => {
    const tag = randomUUID();
    const infraFileName = getConfigFileName(tag);

    writeFileSync(
      infraFileName,
      JSON.stringify({
        apiPort: 8103,
        name: tag,
        region: 'us-east-1',
        accountNumber: 'account-123',
        stackName: 'TestStack',
        domainName: 'test.example.com',
        baseUrl: 'https://api.test.example.com/',
        apiDomainName: 'api.test.example.com',
        appDomainName: 'app.test.example.com',
        storageDomainName: 'storage.test.example.com',
        storageBucketName: 'storage.test.example.com',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverMemory: 512,
        serverCpu: 256,
        serverImage: 'medplum/medplum-server:2.4.17',
      }),
      'utf8'
    );

    readline.createInterface = jest.fn(() =>
      mockReadline(
        'y' // Yes, write to Parameter Store
      )
    );

    await main(['node', 'index.js', 'aws', 'update-config', tag]);
    unlinkSync(infraFileName);
  });

  test('Skip write to Parameter Store', async () => {
    const tag = randomUUID();
    const infraFileName = getConfigFileName(tag);

    writeFileSync(
      infraFileName,
      JSON.stringify({
        apiPort: 8103,
        name: tag,
        region: 'us-east-1',
        accountNumber: 'account-123',
        stackName: 'TestStack',
        domainName: 'test.example.com',
        baseUrl: 'https://api.test.example.com/',
        apiDomainName: 'api.test.example.com',
        appDomainName: 'app.test.example.com',
        storageDomainName: 'storage.test.example.com',
        storageBucketName: 'storage.test.example.com',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverMemory: 512,
        serverCpu: 256,
        serverImage: 'medplum/medplum-server:2.4.17',
      }),
      'utf8'
    );

    readline.createInterface = jest.fn(() =>
      mockReadline(
        'n' // No, do not write to Parameter Store
      )
    );

    await main(['node', 'index.js', 'aws', 'update-config', tag]);
    unlinkSync(infraFileName);
  });

  test('Infra and server config success', async () => {
    const tag = randomUUID();
    const infraFileName = getConfigFileName(tag);
    const serverFileName = getConfigFileName(tag, true);

    writeFileSync(
      infraFileName,
      JSON.stringify({
        apiPort: 8103,
        name: tag,
        region: 'us-east-1',
        accountNumber: 'account-123',
        stackName: 'TestStack',
        domainName: 'test.example.com',
        apiDomainName: 'api.test.example.com',
        appDomainName: 'app.test.example.com',
        storageDomainName: 'storage.test.example.com',
        storageBucketName: 'storage.test.example.com',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverMemory: 512,
        serverCpu: 256,
        serverImage: 'medplum/medplum-server:2.4.17',
      }),
      'utf8'
    );

    writeFileSync(
      serverFileName,
      JSON.stringify({
        foo: 'bar',
      }),
      'utf8'
    );

    readline.createInterface = jest.fn(() =>
      mockReadline(
        'y' // Yes, write to Parameter Store
      )
    );

    await main(['node', 'index.js', 'aws', 'update-config', tag]);
    unlinkSync(infraFileName);
    unlinkSync(serverFileName);
  });

  test('Infra and server config conflict', async () => {
    console.error = jest.fn();

    const tag = randomUUID();
    const infraFileName = getConfigFileName(tag);
    const serverFileName = getConfigFileName(tag, true);

    writeFileSync(
      infraFileName,
      JSON.stringify({
        apiPort: 8103,
        name: tag,
        region: 'us-east-1',
        accountNumber: 'account-123',
        stackName: 'TestStack',
        domainName: 'test.example.com',
        apiDomainName: 'api.test.example.com',
        appDomainName: 'app.test.example.com',
        storageDomainName: 'storage.test.example.com',
        storageBucketName: 'storage.test.example.com',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverMemory: 512,
        serverCpu: 256,
        serverImage: 'medplum/medplum-server:2.4.17',
      }),
      'utf8'
    );

    writeFileSync(
      serverFileName,
      JSON.stringify({
        port: 5000,
      }),
      'utf8'
    );

    readline.createInterface = jest.fn(() => mockReadline());

    await main(['node', 'index.js', 'aws', 'update-config', tag]);
    unlinkSync(infraFileName);
    unlinkSync(serverFileName);

    expect(console.error).toHaveBeenCalledWith('Error: Infra "apiPort" (8103) does not match server "port" (5000)');
  });
});
