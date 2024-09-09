import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ExternalSecret, MedplumInfraConfig, MedplumSourceInfraConfig, OperationOutcomeError } from '@medplum/core';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import {
  InfraConfigNormalizer,
  assertValidExternalSecret,
  isExternalSecret,
  normalizeFetchedValue,
  normalizeInfraConfig,
} from './config';

const baseConfig = {
  name: 'MyMedplumApp',
  stackName: { system: 'aws_ssm_parameter_store', key: 'stackName', type: 'string' },
  accountNumber: 'medplum123',
  region: 'us-east-1',
  domainName: 'foomedical.com',
  vpcId: 'abc-321123',
  apiPort: { system: 'aws_ssm_parameter_store', key: 'apiPort', type: 'number' },
  apiDomainName: { system: 'aws_ssm_parameter_store', key: 'apiDomainName', type: 'string' },
  apiSslCertArn: { system: 'aws_ssm_parameter_store', key: 'apiSslCertArn', type: 'string' },
  apiInternetFacing: true,
  appDomainName: 'app.foomedical.com',
  appSslCertArn: 'arn:abc-123',
  appApiProxy: { system: 'aws_ssm_parameter_store', key: 'appApiProxy', type: 'boolean' },
  storageBucketName: { system: 'aws_ssm_parameter_store', key: 'storageBucketName', type: 'string' },
  storageDomainName: 'storage.foomedical.com',
  storageSslCertArn: 'arn:def-123',
  signingKeyId: { system: 'aws_ssm_parameter_store', key: 'signingKeyId', type: 'string' },
  storagePublicKey: { system: 'aws_ssm_parameter_store', key: 'storagePublicKey', type: 'string' },
  baseUrl: 'foomedical.com',
  maxAzs: { system: 'aws_ssm_parameter_store', key: 'maxAzs', type: 'number' },
  rdsInstances: { system: 'aws_ssm_parameter_store', key: 'rdsInstances', type: 'number' },
  rdsInstanceType: 'big',
  desiredServerCount: { system: 'aws_ssm_parameter_store', key: 'desiredServerCount', type: 'number' },
  serverImage: 'arn:our-image',
  serverMemory: { system: 'aws_ssm_parameter_store', key: 'serverMemory', type: 'number' },
  serverCpu: { system: 'aws_ssm_parameter_store', key: 'serverCpu', type: 'number' },
  clamscanEnabled: false,
  clamscanLoggingBucket: 'no_logging',
  clamscanLoggingPrefix: 'foo_',
  skipDns: true,
} as const satisfies MedplumSourceInfraConfig;

// TODO: Test throwing on missing region

const additionalContainers = [
  {
    name: 'BIG IMAGE',
    image: 'arn:big_image',
    environment: {
      FOO: 'BAR',
      MED: { system: 'aws_ssm_parameter_store', key: 'MED', type: 'string' },
    },
  },
] as const;

const cloudTrailAlarms = {
  logGroupName: { system: 'aws_ssm_parameter_store', key: 'logGroupName', type: 'string' },
  logGroupCreate: { system: 'aws_ssm_parameter_store', key: 'logGroupCreate', type: 'boolean' },
} as const;

describe('Config', () => {
  describe('normalizeInfraConfig', () => {
    let mockSSMClient: AwsClientStub<SSMClient>;

    beforeEach(() => {
      mockSSMClient = mockClient(SSMClient);

      mockSSMClient.on(GetParameterCommand).rejects();
      mockSSMClient.on(GetParameterCommand, { Name: 'stackName' }).resolves({
        Parameter: { Name: 'stackName', Value: 'MyFoomedicalStack' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'apiPort' }).resolves({
        Parameter: { Name: 'apiPort', Value: '1337' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'apiDomainName' }).resolves({
        Parameter: { Name: 'apiDomainName', Value: 'api.foomedical.com' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'apiSslCertArn' }).resolves({
        Parameter: { Name: 'apiSslCertArn', Value: 'arn:foomedical_api_ssl_cert' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'appApiProxy' }).resolves({
        Parameter: { Name: 'appApiProxy', Value: 'true' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'signingKeyId' }).resolves({
        Parameter: { Name: 'signingKeyId', Value: 'key-abc123' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'storageBucketName' }).resolves({
        Parameter: { Name: 'storageBucketName', Value: 'foomedical_storage_bucket' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'storagePublicKey' }).resolves({
        Parameter: { Name: 'storagePublicKey', Value: 'VERY_LONG_KEY' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'maxAzs' }).resolves({
        Parameter: { Name: 'maxAzs', Value: '6' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'rdsInstances' }).resolves({
        Parameter: { Name: 'rdsInstances', Value: '10' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'desiredServerCount' }).resolves({
        Parameter: { Name: 'desiredServerCount', Value: '0' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'serverMemory' }).resolves({
        Parameter: { Name: 'serverMemory', Value: '16384' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'serverCpu' }).resolves({
        Parameter: { Name: 'serverCpu', Value: '4096' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'MED' }).resolves({
        Parameter: { Name: 'MED', Value: 'PLUM' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'logGroupName' }).resolves({
        Parameter: { Name: 'logGroupName', Value: 'FOOMEDICAL_PROD' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'logGroupCreate' }).resolves({
        Parameter: { Name: 'logGroupCreate', Value: 'false' },
      });
    });

    afterEach(() => {
      mockSSMClient.restore();
    });

    test('Missing `region` in config', async () => {
      // @ts-expect-error Region must be defined
      await expect(normalizeInfraConfig({ ...baseConfig, region: undefined })).rejects.toBeInstanceOf(
        OperationOutcomeError
      );
    });

    test('Valid infra source config w/ external secrets', async () => {
      const result = await normalizeInfraConfig(baseConfig);
      expect(result).toEqual<MedplumInfraConfig>({
        name: 'MyMedplumApp',
        stackName: 'MyFoomedicalStack',
        accountNumber: 'medplum123',
        region: 'us-east-1',
        domainName: 'foomedical.com',
        vpcId: 'abc-321123',
        apiPort: 1337,
        apiDomainName: 'api.foomedical.com',
        apiSslCertArn: 'arn:foomedical_api_ssl_cert',
        apiInternetFacing: true,
        appDomainName: 'app.foomedical.com',
        appSslCertArn: 'arn:abc-123',
        appApiProxy: true,
        storageBucketName: 'foomedical_storage_bucket',
        storageDomainName: 'storage.foomedical.com',
        storageSslCertArn: 'arn:def-123',
        signingKeyId: 'key-abc123',
        storagePublicKey: 'VERY_LONG_KEY',
        baseUrl: 'foomedical.com',
        maxAzs: 6,
        rdsInstances: 10,
        rdsInstanceType: 'big',
        desiredServerCount: 0,
        serverImage: 'arn:our-image',
        serverMemory: 16384,
        serverCpu: 4096,
        clamscanEnabled: false,
        clamscanLoggingBucket: 'no_logging',
        clamscanLoggingPrefix: 'foo_',
        skipDns: true,
      });
    });

    test('Valid source config w/ additional containers', async () => {
      const result = await normalizeInfraConfig({ ...baseConfig, additionalContainers: [...additionalContainers] });
      expect(result).toEqual<MedplumInfraConfig>({
        name: 'MyMedplumApp',
        stackName: 'MyFoomedicalStack',
        accountNumber: 'medplum123',
        region: 'us-east-1',
        domainName: 'foomedical.com',
        vpcId: 'abc-321123',
        apiPort: 1337,
        apiDomainName: 'api.foomedical.com',
        apiSslCertArn: 'arn:foomedical_api_ssl_cert',
        apiInternetFacing: true,
        appDomainName: 'app.foomedical.com',
        appSslCertArn: 'arn:abc-123',
        appApiProxy: true,
        storageBucketName: 'foomedical_storage_bucket',
        storageDomainName: 'storage.foomedical.com',
        storageSslCertArn: 'arn:def-123',
        signingKeyId: 'key-abc123',
        storagePublicKey: 'VERY_LONG_KEY',
        baseUrl: 'foomedical.com',
        maxAzs: 6,
        rdsInstances: 10,
        rdsInstanceType: 'big',
        desiredServerCount: 0,
        serverImage: 'arn:our-image',
        serverMemory: 16384,
        serverCpu: 4096,
        clamscanEnabled: false,
        clamscanLoggingBucket: 'no_logging',
        clamscanLoggingPrefix: 'foo_',
        skipDns: true,
        additionalContainers: [
          {
            name: 'BIG IMAGE',
            image: 'arn:big_image',
            environment: {
              FOO: 'BAR',
              MED: 'PLUM',
            },
          },
        ],
      });
    });

    test('Valid source config w/ `cloudTrailAlarms`', async () => {
      const result = await normalizeInfraConfig({ ...baseConfig, cloudTrailAlarms: { ...cloudTrailAlarms } });
      expect(result).toEqual<MedplumInfraConfig>({
        name: 'MyMedplumApp',
        stackName: 'MyFoomedicalStack',
        accountNumber: 'medplum123',
        region: 'us-east-1',
        domainName: 'foomedical.com',
        vpcId: 'abc-321123',
        apiPort: 1337,
        apiDomainName: 'api.foomedical.com',
        apiSslCertArn: 'arn:foomedical_api_ssl_cert',
        apiInternetFacing: true,
        appDomainName: 'app.foomedical.com',
        appSslCertArn: 'arn:abc-123',
        appApiProxy: true,
        storageBucketName: 'foomedical_storage_bucket',
        storageDomainName: 'storage.foomedical.com',
        storageSslCertArn: 'arn:def-123',
        signingKeyId: 'key-abc123',
        storagePublicKey: 'VERY_LONG_KEY',
        baseUrl: 'foomedical.com',
        maxAzs: 6,
        rdsInstances: 10,
        rdsInstanceType: 'big',
        desiredServerCount: 0,
        serverImage: 'arn:our-image',
        serverMemory: 16384,
        serverCpu: 4096,
        clamscanEnabled: false,
        clamscanLoggingBucket: 'no_logging',
        clamscanLoggingPrefix: 'foo_',
        skipDns: true,
        cloudTrailAlarms: {
          logGroupName: 'FOOMEDICAL_PROD',
          logGroupCreate: false,
        },
      });
    });

    test('Invalid system', async () => {
      await expect(
        // @ts-expect-error System is not valid
        normalizeInfraConfig({ ...baseConfig, apiPort: { system: 'google_drive', key: 'abc', type: 'number' } })
      ).rejects.toBeInstanceOf(OperationOutcomeError);
    });

    test('Invalid AWS Param Store key', async () => {
      await expect(
        normalizeInfraConfig({
          ...baseConfig,
          apiPort: { system: 'aws_ssm_parameter_store', key: 'abc', type: 'number' },
        })
      ).rejects.toBeInstanceOf(Error);
    });

    test('Invalid type specified', async () => {
      await expect(
        normalizeInfraConfig({
          ...baseConfig,
          // @ts-expect-error Type 'plum' not a valid type
          apiPort: { system: 'aws_ssm_parameter_store', key: 'abc', type: 'plum' },
        })
      ).rejects.toBeInstanceOf(OperationOutcomeError);
    });

    test('Mismatched type specified', async () => {
      await expect(
        normalizeInfraConfig({
          ...baseConfig,
          // @ts-expect-error Type 'boolean' is not the proper type for `apiPort`
          apiPort: { system: 'aws_ssm_parameter_store', key: 'apiPort', type: 'boolean' },
        })
      ).rejects.toBeInstanceOf(OperationOutcomeError);
    });
  });

  describe('normalizeFetchedValue', () => {
    // Test [object, string] => throws
    test('Provided object, expected string => throws', () => {
      // @ts-expect-error rawValue must be a valid primitive, string | boolean | number
      expect(() => normalizeFetchedValue('medplumString', { med: 'plum' }, 'string')).toThrow(OperationOutcomeError);
    });
    // Test [string, string] => return raw
    test('Provided string, expected string => rawValue', () => {
      expect(normalizeFetchedValue('medplumString', 'medplum', 'string')).toEqual('medplum');
    });
    // Test [string, number] => number
    test('Provided string, expected number => parseInt(string)', () => {
      expect(normalizeFetchedValue('medplumNumber', '20', 'number')).toEqual(20);
    });
    // Test [number, number] => rawValue
    test('Provided number, expected number => rawValue', () => {
      expect(normalizeFetchedValue('medplumNumber', 20, 'number')).toEqual(20);
    });
    // Test [invalidNumStr, number] => throws
    test('Provided non-numeric string, expected number => throws', () => {
      expect(() => normalizeFetchedValue('medplumNumber', 'medplum', 'number')).toThrow(OperationOutcomeError);
    });
    // Test [string, boolean] => boolean
    test('Provided string, expected boolean => parsedBoolean', () => {
      expect(normalizeFetchedValue('medplumBool', 'TRUE', 'boolean')).toEqual(true);
      expect(normalizeFetchedValue('medplumBool', 'false', 'boolean')).toEqual(false);
      expect(normalizeFetchedValue('medplumBool', 'TrUe', 'boolean')).toEqual(true);
      expect(normalizeFetchedValue('medplumBool', 'FALSE', 'boolean')).toEqual(false);
    });
    // Test [invalidStr, boolean] => throws
    test('Provided string, expected boolean => parsedBoolean', () => {
      expect(() => normalizeFetchedValue('medplumBool', 'TRUEE', 'boolean')).toThrow(OperationOutcomeError);
      expect(() => normalizeFetchedValue('medplumBool', '10', 'boolean')).toThrow(OperationOutcomeError);
      expect(() => normalizeFetchedValue('medplumBool', '0', 'boolean')).toThrow(OperationOutcomeError);
    });
    // Test [bool, number] => throws
    test('Provided boolean, expected number => throws', () => {
      expect(() => normalizeFetchedValue('medplumNumber', true, 'number')).toThrow(OperationOutcomeError);
    });
    // Test [string, invalid_type] => throws
    test('Provided string, expected {invalidType} => throws', () => {
      // @ts-expect-error Plum is not a valid expectedType
      expect(() => normalizeFetchedValue('medplum???', 'medplum', 'plum')).toThrow(OperationOutcomeError);
    });
  });

  describe('fetchParameterStoreSecret', () => {
    let mockSSMClient: AwsClientStub<SSMClient>;
    let configNormalizer: InfraConfigNormalizer;

    beforeEach(() => {
      mockSSMClient = mockClient(SSMClient);

      mockSSMClient.on(GetParameterCommand).rejects();
      mockSSMClient.on(GetParameterCommand, { Name: 'stackName' }).resolves({
        Parameter: { Name: 'stackName', Value: 'MyFoomedicalStack' },
      });
      mockSSMClient.on(GetParameterCommand, { Name: 'emptyValue' }).resolves({
        Parameter: { Name: 'emptyValue' },
      });

      configNormalizer = new InfraConfigNormalizer(baseConfig);
    });

    afterEach(() => {
      mockSSMClient.restore();
    });

    test('Valid key in param store', async () => {
      await expect(configNormalizer.fetchParameterStoreSecret('stackName')).resolves.toEqual('MyFoomedicalStack');
    });

    test('Invalid key in param store', async () => {
      await expect(configNormalizer.fetchParameterStoreSecret('medplum')).rejects.toBeInstanceOf(Error);
    });

    test('Valid key with no value', async () => {
      await expect(configNormalizer.fetchParameterStoreSecret('emptyValue')).rejects.toBeInstanceOf(
        OperationOutcomeError
      );
    });
  });

  describe('normalizeObjectInInfraConfig', () => {
    let mockSSMClient: AwsClientStub<SSMClient>;
    let configNormalizer: InfraConfigNormalizer;

    beforeEach(() => {
      mockSSMClient = mockClient(SSMClient);

      mockSSMClient.on(GetParameterCommand).rejects();
      mockSSMClient.on(GetParameterCommand, { Name: 'medplumSecret' }).resolves({
        Parameter: { Name: 'medplumSecret', Value: 'MyMedplumSecret' },
      });

      configNormalizer = new InfraConfigNormalizer(baseConfig);
    });

    afterEach(() => {
      mockSSMClient.restore();
    });

    test('Array of primitives or secrets', async () => {
      expect(
        await configNormalizer.normalizeObjectInInfraConfig({
          medplumStuff: [
            'medplum',
            {
              system: 'aws_ssm_parameter_store',
              key: 'medplumSecret',
              type: 'string',
            } satisfies ExternalSecret<'string'>,
          ],
        })
      ).toEqual({ medplumStuff: ['medplum', 'MyMedplumSecret'] });
      expect(
        await configNormalizer.normalizeObjectInInfraConfig({
          medplumStuff: [
            {
              system: 'aws_ssm_parameter_store',
              key: 'medplumSecret',
              type: 'string',
            } satisfies ExternalSecret<'string'>,
            'medplum',
          ],
        })
      ).toEqual({ medplumStuff: ['MyMedplumSecret', 'medplum'] });
    });
  });

  describe('assertValidExternalSecret', () => {
    // Test perfectly valid secret
    test('Valid ExternalSecret', () => {
      expect(() =>
        assertValidExternalSecret({
          system: 'aws_ssm_parameter_store',
          key: 'medplumString',
          type: 'string',
        } satisfies ExternalSecret<'string'>)
      ).not.toThrow();
    });
    // Test secret with shape but invalid type
    test('Almost valid ExternalSecret, invalid type value', () => {
      expect(() =>
        assertValidExternalSecret({
          system: 'aws_ssm_parameter_store',
          key: 'medplumString',
          type: 'plum',
        })
      ).toThrow(OperationOutcomeError);
    });
    // Test completely invalid secret
    test('Invalid ExternalSecret', () => {
      expect(() =>
        assertValidExternalSecret({
          key: 10,
          type: true,
        })
      ).toThrow(OperationOutcomeError);
    });
  });

  describe('isExternalSecret', () => {
    // Test perfectly valid secret
    test('Valid ExternalSecret', () => {
      expect(
        isExternalSecret({
          system: 'aws_ssm_parameter_store',
          key: 'medplumString',
          type: 'string',
        } satisfies ExternalSecret<'string'>)
      ).toEqual(true);
    });
    // Test secret with shape but invalid type
    test('Almost valid ExternalSecret, invalid type value', () => {
      expect(
        isExternalSecret({
          system: 'aws_ssm_parameter_store',
          key: 'medplumString',
          type: 'plum',
        })
      ).toEqual(false);
    });
    // Test completely invalid secret
    test('Invalid ExternalSecret', () => {
      expect(
        isExternalSecret({
          key: 10,
          type: true,
        })
      ).toEqual(false);
    });
  });
});
