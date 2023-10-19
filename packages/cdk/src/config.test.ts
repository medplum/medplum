import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { normalizeInfraConfig } from './config';

const baseConfig = {
  name: 'MyMedplumApp',
  stackName: { system: 'aws_ssm_parameter_store', key: '/:stackName', type: 'string' },
  accountNumber: 'medplum123',
  region: 'us-east-1',
  domainName: 'foomedical.com',
  vpcId: 'abc-321123',
  apiPort: { system: 'aws_ssm_parameter_store', key: '/:apiPort', type: 'number' },
  apiDomainName: { system: 'aws_ssm_parameter_store', key: '/:apiDomainName', type: 'string' },
  apiSslCertArn: { system: 'aws_ssm_parameter_store', key: '/:apiSslCertArn', type: 'string' },
  apiInternetFacing: true,
  appDomainName: 'app.foomedical.com',
  appSslCertArn: 'arn:abc-123',
  appApiProxy: { system: 'aws_ssm_parameter_store', key: '/:appApiProxy', type: 'boolean' },
  storageBucketName: { system: 'aws_ssm_parameter_store', key: '/:storageBucketName', type: 'string' },
  storageDomainName: 'storage.foomedical.com',
  storageSslCertArn: 'arn:def-123',
  signingKeyId: { system: 'aws_ssm_parameter_store', key: '/:signingKeyId', type: 'string' },
  storagePublicKey: { system: 'aws_ssm_parameter_store', key: '/:storagePublicKey', type: 'string' },
  baseUrl: 'foomedical.com',
  maxAzs: { system: 'aws_ssm_parameter_store', key: '/:maxAzs', type: 'number' },
  rdsInstances: { system: 'aws_ssm_parameter_store', key: '/:rdsInstances', type: 'number' },
  rdsInstanceType: 'big',
  desiredServerCount: { system: 'aws_ssm_parameter_store', key: '/:desiredServerCount', type: 'number' },
  serverImage: 'arn:our-image',
  serverMemory: { system: 'aws_ssm_parameter_store', key: '/:serverMemory', type: 'number' },
  serverCpu: { system: 'aws_ssm_parameter_store', key: '/:serverCpu', type: 'number' },
  clamscanEnabled: false,
  clamscanLoggingBucket: 'no_logging',
  clamscanLoggingPrefix: 'foo_',
  skipDns: true,
} as const;

// const additionalContainers = [
//   {
//     name: 'BIG IMAGE',
//     image: 'arn:big_image',
//     environment: {
//       FOO: 'BAR',
//       OTHER_FOO: { system: 'aws_ssm_parameter_store', key: '/:OTHER_FOO', type: 'string' },
//     },
//   },
// ] as const;

// const cloudTrailAlarms = {
//   logGroupName: { system: 'aws_ssm_parameter_store', key: '/:logGroupName', type: 'string' },
//   logGroupCreate: { system: 'aws_ssm_parameter_store', key: '/:logGroupCreate', type: 'boolean' },
// } as const;

describe('Config', () => {
  let mockSSMClient: AwsClientStub<SSMClient>;

  beforeEach(() => {
    mockSSMClient = mockClient(SSMClient);

    mockSSMClient.on(GetParametersByPathCommand).resolves({
      Parameters: [
        { Name: 'stackName', Value: 'MyFoomedicalStack' },
        { Name: 'apiPort', Value: '1337' },
        { Name: 'apiDomainName', Value: 'api.foomedical.com' },
        { Name: 'apiSslCertArn', Value: 'arn:foomedical_api_ssl_cert' },
        { Name: 'appApiProxy', Value: 'true' },
        { Name: 'signingKeyId', Value: 'key-abc123' },
        { Name: 'storageBucketName', Value: 'foomedical_storage_bucket' },
        { Name: 'storagePublicKey', Value: 'VERY_LONG_KEY' },
        { Name: 'maxAzs', Value: '6' },
        { Name: 'rdsInstances', Value: '10' },
        { Name: 'desiredServerCount', Value: '0' },
        { Name: 'serverMemory', Value: '16384' },
        { Name: 'serverCpu', Value: '4096' },
      ],
    });
  });

  afterEach(() => {
    mockSSMClient.restore();
  });

  test('It should function', async () => {
    const result = await normalizeInfraConfig(baseConfig);
    expect(result).toBeDefined();
    console.log(result);
  });
});
