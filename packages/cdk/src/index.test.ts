import { unlinkSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { main } from './index';

describe('Infra', () => {
  beforeEach(() => {
    console.log = jest.fn();
  });

  test('Missing config', () => {
    expect(() => main()).not.toThrow();
  });

  test('Synth stack', () => {
    // Create a temp config file
    const filename = resolve('./medplum.test.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'unittest',
        stackName: 'MedplumUnitTestStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
        loadBalancerLoggingEnabled: true,
        loadBalancerLoggingBucket: 'medplum-logs-us-east-1',
        loadBalancerLoggingPrefix: 'elb',
        clamscanEnabled: true,
        clamscanLoggingBucket: 'medplum-logs-us-east-1',
        clamscanLoggingPrefix: 'clamscan',
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Multi region stack', () => {
    const filename = resolve('./medplum.multiregion.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'multiregion',
        stackName: 'MedplumMultiRegionStack',
        accountNumber: '647991932601',
        region: 'ap-southeast-1',
        domainName: 'ap-southeast-1.medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
        loadBalancerLoggingEnabled: true,
        loadBalancerLoggingBucket: 'medplum-logs-us-east-1',
        loadBalancerLoggingPrefix: 'elb',
        clamscanEnabled: true,
        clamscanLoggingBucket: 'medplum-logs-us-east-1',
        clamscanLoggingPrefix: 'clamscan',
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('ECR image', () => {
    // Create a temp config file
    const filename = resolve('./medplum.customvpc.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'customvpc',
        stackName: 'MedplumCustomVpcStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        rdsInstanceType: 't3.micro',
        desiredServerCount: 1,
        serverImage: '647991932601.dkr.ecr.us-east-1.amazonaws.com/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Custom VPC', () => {
    // Create a temp config file
    const filename = resolve('./medplum.customvpc.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'customvpc',
        stackName: 'MedplumCustomVpcStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        vpcId: 'vpc-0fc3a4d0600000000',
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:latest',
        serverMemory: 512,
        serverCpu: 256,
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Custom RDS instance type', () => {
    // Create a temp config file
    const filename = resolve('./medplum.customRdsInstanceType.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'customRdsInstanceType',
        stackName: 'MedplumCustomRdsInstanceTypeStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        rdsInstanceType: 't3.micro',
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:latest',
        serverMemory: 512,
        serverCpu: 256,
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Custom RDS secrets', () => {
    // Create a temp config file
    const filename = resolve('./medplum.customRdsSecrets.config.json');
    const rdsSecretsArn = 'arn:aws:secretsmanager:s-east-1:647991932601:secret:SecretName-6RandomCharacters';
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'customRdsSecrets',
        stackName: 'MedplumCustomRdsSecretsStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsSecretsArn,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:latest',
        serverMemory: 512,
        serverCpu: 256,
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Skip DNS', () => {
    // Create a temp config file
    const filename = resolve('./medplum.skipDns.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'skipDns',
        stackName: 'MedplumSkipDnsStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:latest',
        serverMemory: 512,
        serverCpu: 256,
        skipDns: true,
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Add DataDog container', () => {
    // Create a temp config file
    const filename = resolve('./medplum.datadog.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'datadog',
        stackName: 'MedplumDataDogStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:latest',
        serverMemory: 512,
        serverCpu: 256,
        additionalContainers: [
          {
            name: 'datadog-agent',
            image: 'datadog/agent:latest',
            environment: {
              DD_SITE: 'datadoghq.com',
              DD_API_KEY: 'YOUR_DATADOG_API_KEY',
            },
          },
        ],
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('API in private subnet', () => {
    // Create a temp config file
    const filename = resolve('./medplum.test.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'unittest',
        stackName: 'MedplumUnitTestStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        apiInternetFacing: false,
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
        loadBalancerLoggingEnabled: true,
        loadBalancerLoggingBucket: 'medplum-logs-us-east-1',
        loadBalancerLoggingPrefix: 'elb',
        clamscanEnabled: true,
        clamscanLoggingBucket: 'medplum-logs-us-east-1',
        clamscanLoggingPrefix: 'clamscan',
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Disable app-api proxy', () => {
    // Create a temp config file
    const filename = resolve('./medplum.test.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'unittest',
        stackName: 'MedplumUnitTestStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        appApiProxy: false,
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
        loadBalancerLoggingEnabled: true,
        loadBalancerLoggingBucket: 'medplum-logs-us-east-1',
        loadBalancerLoggingPrefix: 'elb',
        clamscanEnabled: true,
        clamscanLoggingBucket: 'medplum-logs-us-east-1',
        clamscanLoggingPrefix: 'clamscan',
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Custom cacheNodeType', () => {
    // Create a temp config file
    const filename = resolve('./medplum.cacheNodeType.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'unittest',
        stackName: 'MedplumCacheNodeTypeStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        appApiProxy: false,
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        cacheNodeType: 'cache.m4.2xlarge',
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
        loadBalancerLoggingEnabled: true,
        loadBalancerLoggingBucket: 'medplum-logs-us-east-1',
        loadBalancerLoggingPrefix: 'elb',
        clamscanEnabled: true,
        clamscanLoggingBucket: 'medplum-logs-us-east-1',
        clamscanLoggingPrefix: 'clamscan',
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('RDS reader instance', () => {
    const filename = resolve('./medplum.reader.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'unittest',
        stackName: 'MedplumReaderStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 2,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('RDS proxy', () => {
    const filename = resolve('./medplum.rdsproxy.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'unittest',
        stackName: 'MedplumRdsProxyStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 2,
        rdsProxyEnabled: true,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Existing signing key', () => {
    const filename = resolve('./medplum.signingKey.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'signingKey',
        stackName: 'MedplumSigningKeyStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        signingKeyId: 'K1234',
        maxAzs: 2,
        rdsInstances: 2,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('CloudTrail alarms', () => {
    const filename = resolve('./medplum.cloudtrail.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'cloudtrail',
        stackName: 'MedplumCloudTrailStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
        cloudTrailAlarms: {
          logGroupName: 'cloudtrail-logs',
          logGroupCreate: true,
          snsTopicName: 'cloudtrail-alarms',
        },
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Override hosted zone name', () => {
    const filename = resolve('./medplum.hostedzone.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'cloudtrail',
        stackName: 'MedplumHostedZoneStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'foo.medplum.com',
        hostedDomainName: 'foo.medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.foo.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.foo.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.foo.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
        cloudTrailAlarms: {
          logGroupName: 'cloudtrail-logs',
          logGroupCreate: true,
          snsTopicName: 'cloudtrail-alarms',
        },
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Autoscaling', () => {
    const filename = resolve('./medplum.autoscaling.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'autoscaling',
        stackName: 'MedplumAutoscalingTestStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
        fargateAutoScaling: {
          minCapacity: 1,
          maxCapacity: 10,
          targetUtilizationPercent: 50,
          scaleInCooldown: 60,
          scaleOutCooldown: 60,
        },
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Custom security groups', () => {
    // Create a temp config file
    const filename = resolve('./medplum.custom-security-groups.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'custom-security-groups',
        stackName: 'MedplumCustomSecurityGroupsStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
        cacheSecurityGroupId: 'sg-0fc3',
        loadBalancerSecurityGroupId: 'sg-0fc4',
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('IP Set rules', () => {
    // Create a temp config file
    const filename = resolve('./medplum.ipset.config.json');
    writeFileSync(
      filename,
      JSON.stringify({
        name: 'ipset',
        stackName: 'MedplumIpSetStack',
        accountNumber: '647991932601',
        region: 'us-east-1',
        domainName: 'medplum.com',
        apiPort: 8103,
        apiDomainName: 'api.medplum.com',
        apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
        apiWafIpSetArn: 'arn:aws:wafv2:us-east-1:647991932601:ipset/MedplumIpSet',
        appDomainName: 'app.medplum.com',
        appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
        appWafIpSetArn: 'arn:aws:wafv2:us-east-1:647991932601:ipset/MedplumIpSet',
        storageBucketName: 'medplum-storage',
        storageDomainName: 'storage.medplum.com',
        storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
        storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
        storageWafIpSetArn: 'arn:aws:wafv2:us-east-1:647991932601:ipset/MedplumIpSet',
        maxAzs: 2,
        rdsInstances: 1,
        desiredServerCount: 1,
        serverImage: 'medplum/medplum-server:staging',
        serverMemory: 512,
        serverCpu: 256,
        cacheSecurityGroupId: 'sg-0fc3',
        loadBalancerSecurityGroupId: 'sg-0fc4',
      }),
      { encoding: 'utf-8' }
    );

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });
});
