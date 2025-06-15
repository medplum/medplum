import { MedplumSourceInfraConfig } from '@medplum/core';
import { App } from 'aws-cdk-lib';
import { unlinkSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { normalizeInfraConfig } from './config';
import { main, MedplumStack } from './index';

function writeConfig(filename: string, config: any): string {
  const resolvedPath = resolve(filename);
  writeFileSync(resolvedPath, JSON.stringify(config), { encoding: 'utf-8' });
  return resolvedPath;
}

describe('Infra', () => {
  const baseConfig = {
    name: 'unittest',
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
  };
  beforeEach(() => {
    console.log = jest.fn();
  });

  test('Missing config', () => {
    expect(() => main()).not.toThrow();
  });

  test('Synth stack', () => {
    const filename = writeConfig('./medplum.test.config.json', {
      ...baseConfig,
      stackName: 'MedplumUnitTestStack',
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Multi region stack', () => {
    const filename = writeConfig('./medplum.multiregion.config.json', {
      ...baseConfig,
      name: 'multiregion',
      stackName: 'MedplumMultiRegionStack',
      region: 'ap-southeast-1',
      domainName: 'ap-southeast-1.medplum.com',
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('ECR image', () => {
    const filename = writeConfig('./medplum.customvpc.config.json', {
      ...baseConfig,
      name: 'customvpc',
      stackName: 'MedplumCustomVpcStack',
      serverImage: '647991932601.dkr.ecr.us-east-1.amazonaws.com/medplum-server:staging',
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Custom VPC', () => {
    // Create a temp config file
    const filename = writeConfig('./medplum.customvpc.config.json', {
      ...baseConfig,
      name: 'customvpc',
      stackName: 'MedplumCustomVpcStack',
      vpcId: 'vpc-0fc3a4d0600000000',
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Custom RDS instance type', () => {
    const filename = writeConfig('./medplum.customRdsInstanceType.config.json', {
      ...baseConfig,
      name: 'customRdsInstanceType',
      stackName: 'MedplumCustomRdsInstanceTypeStack',
      rdsInstanceType: 't3.micro',
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Custom RDS secrets', () => {
    const filename = writeConfig('./medplum.customRdsSecrets.config.json', {
      ...baseConfig,
      name: 'customRdsSecrets',
      stackName: 'MedplumCustomRdsSecretsStack',
      rdsSecretsArn: 'arn:aws:secretsmanager:s-east-1:647991932601:secret:SecretName-6RandomCharacters',
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Skip DNS', () => {
    const filename = writeConfig('./medplum.skipDns.config.json', {
      ...baseConfig,
      name: 'skipDns',
      stackName: 'MedplumSkipDnsStack',
      skipDns: true,
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Add DataDog container', () => {
    const filename = writeConfig('./medplum.datadog.config.json', {
      ...baseConfig,
      name: 'datadog',
      stackName: 'MedplumDataDogStack',
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
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('API in private subnet', () => {
    const filename = writeConfig('./medplum.test.config.json', {
      ...baseConfig,
      stackName: 'MedplumUnitTestStack',
      apiInternetFacing: false,
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Disable app-api proxy', () => {
    const filename = writeConfig('./medplum.test.config.json', {
      ...baseConfig,
      stackName: 'MedplumUnitTestStack',
      appApiProxy: false,
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Custom cacheNodeType', () => {
    const filename = writeConfig('./medplum.cacheNodeType.config.json', {
      ...baseConfig,
      stackName: 'MedplumCacheNodeTypeStack',
      cacheNodeType: 'cache.m4.2xlarge',
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('RDS reader instance', () => {
    const filename = writeConfig('./medplum.reader.config.json', {
      ...baseConfig,
      stackName: 'MedplumReaderStack',
      rdsInstances: 2,
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('RDS proxy', () => {
    const filename = writeConfig('./medplum.rdsproxy.config.json', {
      ...baseConfig,
      stackName: 'MedplumRdsProxyStack',
      rdsProxyEnabled: true,
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Existing signing key', () => {
    const filename = writeConfig('./medplum.signingKey.config.json', {
      ...baseConfig,
      name: 'signingKey',
      stackName: 'MedplumSigningKeyStack',
      signingKeyId: 'K1234',
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('CloudTrail alarms', () => {
    const filename = writeConfig('./medplum.cloudtrail.config.json', {
      ...baseConfig,
      name: 'cloudtrail',
      stackName: 'MedplumCloudTrailStack',
      cloudTrailAlarms: {
        logGroupName: 'cloudtrail-logs',
        logGroupCreate: true,
        snsTopicName: 'cloudtrail-alarms',
      },
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Override hosted zone name', () => {
    const filename = writeConfig('./medplum.hostedzone.config.json', {
      ...baseConfig,
      name: 'cloudtrail',
      stackName: 'MedplumHostedZoneStack',
      domainName: 'foo.medplum.com',
      hostedDomainName: 'foo.medplum.com',
      apiDomainName: 'api.foo.medplum.com',
      appDomainName: 'app.foo.medplum.com',
      storageDomainName: 'storage.foo.medplum.com',
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Autoscaling', () => {
    const filename = writeConfig('./medplum.autoscaling.config.json', {
      ...baseConfig,
      name: 'autoscaling',
      stackName: 'MedplumAutoscalingTestStack',
      fargateAutoScaling: {
        minCapacity: 1,
        maxCapacity: 10,
        targetUtilizationPercent: 50,
        scaleInCooldown: 60,
        scaleOutCooldown: 60,
      },
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Custom security groups', () => {
    const filename = writeConfig('./medplum.custom-security-groups.config.json', {
      ...baseConfig,
      name: 'custom-security-groups',
      stackName: 'MedplumCustomSecurityGroupsStack',
      cacheSecurityGroupId: 'sg-0fc3',
      loadBalancerSecurityGroupId: 'sg-0fc4',
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('IP Set rules', () => {
    const filename = writeConfig('./medplum.ipset.config.json', {
      ...baseConfig,
      name: 'ipset',
      stackName: 'MedplumIpSetStack',
      apiWafIpSetArn: 'arn:aws:wafv2:us-east-1:647991932601:ipset/MedplumIpSet',
      appWafIpSetArn: 'arn:aws:wafv2:us-east-1:647991932601:ipset/MedplumIpSet',
      storageWafIpSetArn: 'arn:aws:wafv2:us-east-1:647991932601:ipset/MedplumIpSet',
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('rdsPersistentParameterGroups', () => {
    const filename = writeConfig('./medplum.pgpersistentparams.config.json', {
      ...baseConfig,
      stackName: 'MedplumPGStep1Stack',
      rdsPersistentParameterGroups: true,
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('rdsIdsMajorVersionSuffix without rdsPersistentParameterGroups fails', async () => {
    const config: MedplumSourceInfraConfig = {
      ...baseConfig,
      stackName: 'MedplumPGStep1Stack',
      rdsIdsMajorVersionSuffix: true,
      vpcId: '',
      apiWafIpSetArn: '',
      appWafIpSetArn: '',
      signingKeyId: '',
      storageWafIpSetArn: '',
      baseUrl: '',
      rdsInstanceType: '',
    };
    const app = new App();
    const normalizedConifg = await normalizeInfraConfig(config);
    expect(() => new MedplumStack(app, normalizedConifg)).toThrow(
      'rdsPersistentParameterGroups must be true when rdsIdsMajorVersionSuffix is true'
    );
  });

  test('rdsPersistentParameterGroups and rdsIdsMajorVersionSuffix', () => {
    const filename = writeConfig('./medplum.PersistentAndIds.config.json', {
      ...baseConfig,
      stackName: 'MedplumPGStep1Stack',
      rdsPersistentParameterGroups: true,
      rdsIdsMajorVersionSuffix: true,
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Create WAF logging group', () => {
    const filename = writeConfig('./medplum.createWafLogGroup.config.json', {
      ...baseConfig,
      name: 'createWafLogGroup',
      stackName: 'MedplumCreateWafLogGroupStack',
      wafLogGroupName: 'waf-logs',
      wafLogGroupCreate: true,
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });

  test('Use existing WAF logging group', () => {
    const filename = writeConfig('./medplum.existingWafLogGroup.config.json', {
      ...baseConfig,
      name: 'existingWafLogGroup',
      stackName: 'MedplumExistingWafLogGroupStack',
      wafLogGroupName: 'waf-logs',
      wafLogGroupCreate: true,
    });

    expect(() => main({ config: filename })).not.toThrow();
    unlinkSync(filename);
  });
});
