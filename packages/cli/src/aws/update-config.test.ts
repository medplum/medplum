import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { randomUUID } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import readline from 'node:readline';
import { main } from '../index';
import { getConfigFileName } from '../utils';
import { mockReadline } from './test.utils';

jest.mock('node:readline');

describe('update-config command', () => {
  let ssmClient: AwsClientStub<SSMClient>;
  let processError: jest.SpyInstance;

  beforeAll(() => {
    process.exit = jest.fn<never, any>().mockImplementation(function exit(exitCode: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    }) as unknown as typeof process.exit;
    processError = jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());
  });

  beforeEach(() => {
    ssmClient = mockClient(SSMClient);
    ssmClient.on(GetParameterCommand).rejects({ name: 'ParameterNotFound' });
    ssmClient.on(PutParameterCommand).resolves({});
  });

  afterEach(() => {
    ssmClient.restore();
  });

  test('Not found', async () => {
    console.log = jest.fn();

    const tag = randomUUID();

    readline.createInterface = jest.fn(() => mockReadline());

    await expect(main(['node', 'index.js', 'aws', 'update-config', tag])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(console.log).toHaveBeenCalledWith(`Config not found: ${tag} (${getConfigFileName(tag)})`);
    expect(processError).toHaveBeenCalledWith(`Error: Config not found: ${tag}\n`);
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
    const serverFileName = getConfigFileName(tag, { server: true });

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
        storageBaseUrl: 'https://storage.test.example.com/binary/',
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
    const serverFileName = getConfigFileName(tag, { server: true });

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

    await expect(main(['node', 'index.js', 'aws', 'update-config', tag])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    unlinkSync(infraFileName);
    unlinkSync(serverFileName);

    expect(processError).toHaveBeenCalledWith('Error: Infra "apiPort" (8103) does not match server "port" (5000)\n');
  });

  test('Auto confirm with --yes', async () => {
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

    await main(['node', 'index.js', 'aws', 'update-config', tag, '--yes']);
    unlinkSync(infraFileName);

    expect(ssmClient).toHaveReceivedCommandTimes(PutParameterCommand, 4);
  });
});
