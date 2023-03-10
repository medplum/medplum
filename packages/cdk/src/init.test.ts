import { randomUUID } from 'crypto';
import { readFileSync, unlinkSync } from 'fs';
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
      '', // default database instances
      '', // default server instances
      '', // default server memory
      '', // default server cpu
      '', // default server image
      'y', // Yes, generate signing key
      'y', // Yes, request api certificate
      'y', // Yes, request app certificate
      'y', // Yes, request storage certificate
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
  for (const answer of answers) {
    result.question.mockImplementationOnce((_q: string, cb: (answer: string) => void) => cb(answer));
  }
  return result as unknown as readline.Interface;
}
