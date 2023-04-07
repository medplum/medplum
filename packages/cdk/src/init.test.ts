import { randomUUID } from 'crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import readline from 'readline';
import { main } from './init';

jest.mock('@aws-sdk/client-acm');
jest.mock('@aws-sdk/client-ssm');
jest.mock('@aws-sdk/client-sts');

test('Init tool success', async () => {
  const filename = `test-${randomUUID()}.json`;

  await main(
    mockReadline(
      'foo',
      filename,
      'us-east-1',
      'account-123',
      'TestStack',
      'test.example.com',
      'support@example.com',
      '', // default API domain
      '', // default app domain
      '', // default storage domain
      '', // default storage bucket
      '', // default availability zones
      'y', // Yes, create a database
      '', // default database instances
      '', // default server instances
      '', // default server memory
      '', // default server cpu
      '', // default server image
      'y', // Yes, request api certificate
      '', // default DNS validation
      'y', // Yes, request app certificate
      '', // default DNS validation
      'y', // Yes, request storage certificate
      '', // default DNS validation
      'y' // Yes, write to Parameter Store
    )
  );

  const config = JSON.parse(readFileSync(filename, 'utf8'));
  expect(config).toMatchObject({
    apiPort: 8103,
    name: 'foo',
    region: 'us-east-1',
    accountNumber: 'account-123',
    stackName: 'TestStack',
    domainName: 'test.example.com',
    apiDomainName: 'api.test.example.com',
    appDomainName: 'app.test.example.com',
    storageDomainName: 'storage.test.example.com',
    storageBucketName: 'medplum-foo-storage',
    maxAzs: 2,
    rdsInstances: 1,
    desiredServerCount: 1,
    serverMemory: 512,
    serverCpu: 256,
    serverImage: 'medplum/medplum-server:latest',
    storagePublicKey: expect.stringContaining('-----BEGIN PUBLIC KEY-----'),
    apiSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
    appSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
    storageSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
  });
  unlinkSync(filename);
});

test('Overwrite existing file', async () => {
  const filename = `test-${randomUUID()}.json`;
  writeFileSync(filename, '{}', 'utf8');

  await main(
    mockReadline(
      'foo',
      filename,
      'y', // Yes, overwrite
      'us-east-1',
      'account-123',
      'TestStack',
      'test.example.com',
      'support@example.com',
      '', // default API domain
      '', // default app domain
      '', // default storage domain
      '', // default storage bucket
      '', // default availability zones
      'y', // Yes, create a database
      '', // default database instances
      '', // default server instances
      '', // default server memory
      '', // default server cpu
      '', // default server image
      'y', // Yes, request api certificate
      '', // default DNS validation
      'y', // Yes, request app certificate
      '', // default DNS validation
      'y', // Yes, request storage certificate
      '', // default DNS validation
      'y' // Yes, write to Parameter Store
    )
  );

  const config = JSON.parse(readFileSync(filename, 'utf8'));
  expect(config).toMatchObject({
    apiPort: 8103,
    name: 'foo',
    region: 'us-east-1',
    accountNumber: 'account-123',
    stackName: 'TestStack',
    domainName: 'test.example.com',
    apiDomainName: 'api.test.example.com',
    appDomainName: 'app.test.example.com',
    storageDomainName: 'storage.test.example.com',
    storageBucketName: 'medplum-foo-storage',
    maxAzs: 2,
    rdsInstances: 1,
    desiredServerCount: 1,
    serverMemory: 512,
    serverCpu: 256,
    serverImage: 'medplum/medplum-server:latest',
    storagePublicKey: expect.stringContaining('-----BEGIN PUBLIC KEY-----'),
    apiSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
    appSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
    storageSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
  });
  unlinkSync(filename);
});

test('Invalid AWS credentials', async () => {
  const filename = `test-${randomUUID()}.json`;

  console.log = jest.fn();

  await main(
    mockReadline(
      'foo',
      filename,
      'us-bad-1', // Special fake region for mock clients
      'account-123',
      'TestStack',
      'test.example.com',
      'support@example.com',
      '', // default API domain
      '', // default app domain
      '', // default storage domain
      '', // default storage bucket
      '', // default availability zones
      'y', // Yes, create a database
      '', // default database instances
      '', // default server instances
      '', // default server memory
      '', // default server cpu
      '', // default server image
      'y', // Yes, request api certificate
      '', // default DNS validation
      'y', // Yes, request app certificate
      '', // default DNS validation
      'y', // Yes, request storage certificate
      '', // default DNS validation
      'y' // Yes, write to Parameter Store
    )
  );

  expect(console.log).toHaveBeenCalledWith('Warning: Unable to get AWS account ID', 'Invalid region');

  const config = JSON.parse(readFileSync(filename, 'utf8'));
  expect(config).toMatchObject({
    apiPort: 8103,
    name: 'foo',
    region: 'us-bad-1',
    accountNumber: 'account-123',
    stackName: 'TestStack',
    domainName: 'test.example.com',
    apiDomainName: 'api.test.example.com',
    appDomainName: 'app.test.example.com',
    storageDomainName: 'storage.test.example.com',
    storageBucketName: 'medplum-foo-storage',
    maxAzs: 2,
    rdsInstances: 1,
    desiredServerCount: 1,
    serverMemory: 512,
    serverCpu: 256,
    serverImage: 'medplum/medplum-server:latest',
    storagePublicKey: expect.stringContaining('-----BEGIN PUBLIC KEY-----'),
    apiSslCertArn: 'TODO',
    appSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
    storageSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
  });
  unlinkSync(filename);
});

test('Bring your own database', async () => {
  const filename = `test-${randomUUID()}.json`;

  await main(
    mockReadline(
      'foo',
      filename,
      'us-east-1',
      'account-123',
      'TestStack',
      'test.example.com',
      'support@example.com',
      '', // default API domain
      '', // default app domain
      '', // default storage domain
      '', // default storage bucket
      '', // default availability zones
      'n', // No, do not create a database
      '', // default server instances
      '', // default server memory
      '', // default server cpu
      '', // default server image
      'y', // Yes, request api certificate
      '', // default DNS validation
      'y', // Yes, request app certificate
      '', // default DNS validation
      'y', // Yes, request storage certificate
      '', // default DNS validation
      'y' // Yes, write to Parameter Store
    )
  );

  const config = JSON.parse(readFileSync(filename, 'utf8'));
  expect(config).toMatchObject({
    apiPort: 8103,
    name: 'foo',
    region: 'us-east-1',
    accountNumber: 'account-123',
    stackName: 'TestStack',
    domainName: 'test.example.com',
    apiDomainName: 'api.test.example.com',
    appDomainName: 'app.test.example.com',
    storageDomainName: 'storage.test.example.com',
    storageBucketName: 'medplum-foo-storage',
    maxAzs: 2,
    rdsSecretsArn: 'TODO',
    desiredServerCount: 1,
    serverMemory: 512,
    serverCpu: 256,
    serverImage: 'medplum/medplum-server:latest',
    storagePublicKey: expect.stringContaining('-----BEGIN PUBLIC KEY-----'),
    apiSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
    appSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
    storageSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
  });
  unlinkSync(filename);
});

test('Do not request SSL certs', async () => {
  const filename = `test-${randomUUID()}.json`;

  await main(
    mockReadline(
      'foo',
      filename,
      'us-east-1',
      'account-123',
      'TestStack',
      'test.example.com',
      'support@example.com',
      '', // default API domain
      '', // default app domain
      '', // default storage domain
      '', // default storage bucket
      '', // default availability zones
      'y', // Yes, create a database
      '', // default database instances
      '', // default server instances
      '', // default server memory
      '', // default server cpu
      '', // default server image
      'n', // No api certificate
      'n', // No app certificate
      'n', // No storage certificate
      'y' // Yes, write to Parameter Store
    )
  );

  const config = JSON.parse(readFileSync(filename, 'utf8'));
  expect(config).toMatchObject({
    apiPort: 8103,
    name: 'foo',
    region: 'us-east-1',
    accountNumber: 'account-123',
    stackName: 'TestStack',
    domainName: 'test.example.com',
    apiDomainName: 'api.test.example.com',
    appDomainName: 'app.test.example.com',
    storageDomainName: 'storage.test.example.com',
    storageBucketName: 'medplum-foo-storage',
    maxAzs: 2,
    rdsInstances: 1,
    desiredServerCount: 1,
    serverMemory: 512,
    serverCpu: 256,
    serverImage: 'medplum/medplum-server:latest',
    storagePublicKey: expect.stringContaining('-----BEGIN PUBLIC KEY-----'),
    apiSslCertArn: 'TODO',
    appSslCertArn: 'TODO',
    storageSslCertArn: 'TODO',
  });
  unlinkSync(filename);
});

test('Existing SSL certificates', async () => {
  const filename = `test-${randomUUID()}.json`;

  await main(
    mockReadline(
      'foo',
      filename,
      'us-east-1',
      'account-123',
      'TestStack',
      'existing.example.com',
      'support@example.com',
      '', // default API domain
      '', // default app domain
      '', // default storage domain
      '', // default storage bucket
      '', // default availability zones
      'y', // Yes, create a database
      '', // default database instances
      '', // default server instances
      '', // default server memory
      '', // default server cpu
      '', // default server image
      'y', // Yes, request api certificate
      '', // default DNS validation
      'y', // Yes, request app certificate
      '', // default DNS validation
      'y', // Yes, request storage certificate
      '', // default DNS validation
      'y' // Yes, write to Parameter Store
    )
  );

  const config = JSON.parse(readFileSync(filename, 'utf8'));
  expect(config).toMatchObject({
    apiPort: 8103,
    name: 'foo',
    region: 'us-east-1',
    accountNumber: 'account-123',
    stackName: 'TestStack',
    domainName: 'existing.example.com',
    apiDomainName: 'api.existing.example.com',
    appDomainName: 'app.existing.example.com',
    storageDomainName: 'storage.existing.example.com',
    storageBucketName: 'medplum-foo-storage',
    maxAzs: 2,
    rdsInstances: 1,
    desiredServerCount: 1,
    serverMemory: 512,
    serverCpu: 256,
    serverImage: 'medplum/medplum-server:latest',
    storagePublicKey: expect.stringContaining('-----BEGIN PUBLIC KEY-----'),
    apiSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789013',
    appSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
    storageSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
  });
  unlinkSync(filename);
});

test('Handle empty support email', async () => {
  const filename = `test-${randomUUID()}.json`;

  await main(
    mockReadline(
      'foo',
      filename,
      'us-east-1',
      'account-123',
      'TestStack',
      'test.example.com',
      '', // Empty support email -- user will have to set manually later, but don't crash
      '', // default API domain
      '', // default app domain
      '', // default storage domain
      '', // default storage bucket
      '', // default availability zones
      'y', // Yes, create a database
      '', // default database instances
      '', // default server instances
      '', // default server memory
      '', // default server cpu
      '', // default server image
      'y', // Yes, request api certificate
      '', // default DNS validation
      'y', // Yes, request app certificate
      '', // default DNS validation
      'y', // Yes, request storage certificate
      '', // default DNS validation
      'y' // Yes, write to Parameter Store
    )
  );

  const config = JSON.parse(readFileSync(filename, 'utf8'));
  expect(config).toMatchObject({
    apiPort: 8103,
    name: 'foo',
    region: 'us-east-1',
    accountNumber: 'account-123',
    stackName: 'TestStack',
    domainName: 'test.example.com',
    apiDomainName: 'api.test.example.com',
    appDomainName: 'app.test.example.com',
    storageDomainName: 'storage.test.example.com',
    storageBucketName: 'medplum-foo-storage',
    maxAzs: 2,
    rdsInstances: 1,
    desiredServerCount: 1,
    serverMemory: 512,
    serverCpu: 256,
    serverImage: 'medplum/medplum-server:latest',
    storagePublicKey: expect.stringContaining('-----BEGIN PUBLIC KEY-----'),
    apiSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
    appSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
    storageSslCertArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
  });
  unlinkSync(filename);
});

function mockReadline(...answers: string[]): readline.Interface {
  const result = { write: jest.fn(), question: jest.fn() };
  const debug = false;
  for (const answer of answers) {
    result.question.mockImplementationOnce((q: string, cb: (answer: string) => void) => {
      if (debug) {
        console.log(q, answer);
      }
      cb(answer);
    });
  }
  return result as unknown as readline.Interface;
}
