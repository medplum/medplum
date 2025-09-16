// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumSourceInfraConfig } from '@medplum/core';
import { App } from 'aws-cdk-lib';
import { unlink, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { normalizeInfraConfig } from './config';
import { main, MedplumStack } from './index';

async function writeConfig(filename: string, config: any): Promise<string> {
  const resolvedPath = resolve(filename);
  await writeFile(resolvedPath, JSON.stringify(config, null, 2), { encoding: 'utf-8' });
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

  test('Missing config', async () => {
    expect(() => main()).not.toThrow();
  });

  test('Synth stack', async () => {
    const filename = await writeConfig('./medplum.test.config.json', {
      ...baseConfig,
      stackName: 'MedplumUnitTestStack',
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Multi region stack', async () => {
    const filename = await writeConfig('./medplum.multiregion.config.json', {
      ...baseConfig,
      name: 'multiregion',
      stackName: 'MedplumMultiRegionStack',
      region: 'ap-southeast-1',
      domainName: 'ap-southeast-1.medplum.com',
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('ECR image', async () => {
    const filename = await writeConfig('./medplum.customvpc.config.json', {
      ...baseConfig,
      name: 'customvpc',
      stackName: 'MedplumCustomVpcStack',
      serverImage: '647991932601.dkr.ecr.us-east-1.amazonaws.com/medplum-server:staging',
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Custom VPC', async () => {
    // Create a temp config file
    const filename = await writeConfig('./medplum.customvpc.config.json', {
      ...baseConfig,
      name: 'customvpc',
      stackName: 'MedplumCustomVpcStack',
      vpcId: 'vpc-0fc3a4d0600000000',
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Custom RDS instance type', async () => {
    const filename = await writeConfig('./medplum.customRdsInstanceType.config.json', {
      ...baseConfig,
      name: 'customRdsInstanceType',
      stackName: 'MedplumCustomRdsInstanceTypeStack',
      rdsInstanceType: 't3.micro',
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Custom RDS secrets', async () => {
    const filename = await writeConfig('./medplum.customRdsSecrets.config.json', {
      ...baseConfig,
      name: 'customRdsSecrets',
      stackName: 'MedplumCustomRdsSecretsStack',
      rdsSecretsArn: 'arn:aws:secretsmanager:s-east-1:647991932601:secret:SecretName-6RandomCharacters',
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Skip DNS', async () => {
    const filename = await writeConfig('./medplum.skipDns.config.json', {
      ...baseConfig,
      name: 'skipDns',
      stackName: 'MedplumSkipDnsStack',
      skipDns: true,
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Add DataDog container', async () => {
    const filename = await writeConfig('./medplum.datadog.config.json', {
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

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('API in private subnet', async () => {
    const filename = await writeConfig('./medplum.test.config.json', {
      ...baseConfig,
      stackName: 'MedplumUnitTestStack',
      apiInternetFacing: false,
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Disable app-api proxy', async () => {
    const filename = await writeConfig('./medplum.test.config.json', {
      ...baseConfig,
      stackName: 'MedplumUnitTestStack',
      appApiProxy: false,
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Custom cacheNodeType', async () => {
    const filename = await writeConfig('./medplum.cacheNodeType.config.json', {
      ...baseConfig,
      stackName: 'MedplumCacheNodeTypeStack',
      cacheNodeType: 'cache.m4.2xlarge',
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('RDS reader instance', async () => {
    const filename = await writeConfig('./medplum.reader.config.json', {
      ...baseConfig,
      stackName: 'MedplumReaderStack',
      rdsInstances: 2,
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('RDS proxy', async () => {
    const filename = await writeConfig('./medplum.rdsproxy.config.json', {
      ...baseConfig,
      stackName: 'MedplumRdsProxyStack',
      rdsProxyEnabled: true,
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Existing signing key', async () => {
    const filename = await writeConfig('./medplum.signingKey.config.json', {
      ...baseConfig,
      name: 'signingKey',
      stackName: 'MedplumSigningKeyStack',
      signingKeyId: 'K1234',
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('CloudTrail alarms', async () => {
    const filename = await writeConfig('./medplum.cloudtrail.config.json', {
      ...baseConfig,
      name: 'cloudtrail',
      stackName: 'MedplumCloudTrailStack',
      cloudTrailAlarms: {
        logGroupName: 'cloudtrail-logs',
        logGroupCreate: true,
        snsTopicName: 'cloudtrail-alarms',
      },
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Override hosted zone name', async () => {
    const filename = await writeConfig('./medplum.hostedzone.config.json', {
      ...baseConfig,
      name: 'cloudtrail',
      stackName: 'MedplumHostedZoneStack',
      domainName: 'foo.medplum.com',
      hostedDomainName: 'foo.medplum.com',
      apiDomainName: 'api.foo.medplum.com',
      appDomainName: 'app.foo.medplum.com',
      storageDomainName: 'storage.foo.medplum.com',
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Autoscaling', async () => {
    const filename = await writeConfig('./medplum.autoscaling.config.json', {
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

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Custom security groups', async () => {
    const filename = await writeConfig('./medplum.custom-security-groups.config.json', {
      ...baseConfig,
      name: 'custom-security-groups',
      stackName: 'MedplumCustomSecurityGroupsStack',
      cacheSecurityGroupId: 'sg-0fc3',
      loadBalancerSecurityGroupId: 'sg-0fc4',
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('IP Set rules', async () => {
    const filename = await writeConfig('./medplum.ipset.config.json', {
      ...baseConfig,
      name: 'ipset',
      stackName: 'MedplumIpSetStack',
      apiWafIpSetArn: 'arn:aws:wafv2:us-east-1:647991932601:ipset/MedplumIpSet',
      appWafIpSetArn: 'arn:aws:wafv2:us-east-1:647991932601:ipset/MedplumIpSet',
      storageWafIpSetArn: 'arn:aws:wafv2:us-east-1:647991932601:ipset/MedplumIpSet',
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('rdsPersistentParameterGroups', async () => {
    const filename = await writeConfig('./medplum.pgpersistentparams.config.json', {
      ...baseConfig,
      stackName: 'MedplumPGStep1Stack',
      rdsPersistentParameterGroups: true,
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
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

  test('rdsPersistentParameterGroups and rdsIdsMajorVersionSuffix', async () => {
    const filename = await writeConfig('./medplum.PersistentAndIds.config.json', {
      ...baseConfig,
      stackName: 'MedplumPGStep1Stack',
      rdsPersistentParameterGroups: true,
      rdsIdsMajorVersionSuffix: true,
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Create WAF logging group', async () => {
    const filename = await writeConfig('./medplum.createWafLogGroup.config.json', {
      ...baseConfig,
      name: 'createWafLogGroup',
      stackName: 'MedplumCreateWafLogGroupStack',
      wafLogGroupName: 'waf-logs',
      wafLogGroupCreate: true,
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Use existing WAF logging group', async () => {
    const filename = await writeConfig('./medplum.existingWafLogGroup.config.json', {
      ...baseConfig,
      name: 'existingWafLogGroup',
      stackName: 'MedplumExistingWafLogGroupStack',
      wafLogGroupName: 'waf-logs',
      wafLogGroupCreate: true,
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Use FireLens and Datadog', async () => {
    const filename = await writeConfig('./medplum.fireLens.config.json', {
      ...baseConfig,
      name: 'fireLens',
      stackName: 'MedplumFireLensGroupStack',
      fireLens: {
        enabled: true,
        logDriverConfig: {
          Name: 'datadog',
          Host: 'http-intake.logs.datadoghq.com',
          TLS: 'on',
          compress: 'gzip',
          apikey: 'YOUR_DATADOG_API_KEY',
          dd_service: 'my-fargate-app',
          dd_source: 'nginx',
          dd_tags: 'environment:dev,project:firelens-example',
          provider: 'ecs',
        },
        logRouterConfig: {
          type: 'fluentbit',
          options: {
            enableECSLogMetadata: true,
          },
        },
      },
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });

  test('Use containerInsightsV2', async () => {
    const filename = await writeConfig('./medplum.containerInsightsV2.config.json', {
      ...baseConfig,
      name: 'containerInsightsV2',
      stackName: 'MedplumContainerInsightsV2Stack',
      containerInsightsV2: 'enhanced',
    });

    await expect(main({ config: filename })).resolves.not.toThrow();
    await unlink(filename);
  });
});
