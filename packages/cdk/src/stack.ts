import { MedplumInfraConfig } from '@medplum/core';
import { App, Fn, aws_s3 as s3, Stack, Tags } from 'aws-cdk-lib';
import { BackEnd } from './backend';
import { CloudTrailAlarms } from './cloudtrail';
import { FrontEnd } from './frontend';
import { grantBucketAccessToOriginAccessIdentity } from './oai';
import { Storage } from './storage';

export class MedplumStack {
  primaryStack: MedplumPrimaryStack;
  globalStack?: MedplumGlobalStack;
  crossRegionStack?: MedplumCrossRegionStack;

  constructor(scope: App, config: MedplumInfraConfig) {
    this.primaryStack = new MedplumPrimaryStack(scope, config);

    if (config.region !== 'us-east-1') {
      // Some resources must be created in us-east-1
      // For example, CloudFront distributions and ACM certificates
      // If the primary region is not us-east-1, create these resources in us-east-1
      this.globalStack = new MedplumGlobalStack(scope, config);
      this.globalStack.addDependency(this.primaryStack);

      // And then, after global resources have been created in us-east-1,
      // create the cross-region resources in the primary region
      this.crossRegionStack = new MedplumCrossRegionStack(scope, config);
      this.crossRegionStack.addDependency(this.globalStack);
    }
  }
}

export class MedplumPrimaryStack extends Stack {
  backEnd: BackEnd;
  frontEnd: FrontEnd;
  storage: Storage;
  cloudTrail: CloudTrailAlarms;

  constructor(scope: App, config: MedplumInfraConfig) {
    super(scope, config.stackName, {
      env: {
        region: config.region,
        account: config.accountNumber,
      },
    });
    Tags.of(this).add('medplum:environment', config.name);

    this.backEnd = new BackEnd(this, config);
    this.frontEnd = new FrontEnd(this, config, config.region);
    this.storage = new Storage(this, config, config.region);
    this.cloudTrail = new CloudTrailAlarms(this, config);
  }
}

export class MedplumGlobalStack extends Stack {
  frontEnd: FrontEnd;
  storage: Storage;
  cloudTrail: CloudTrailAlarms;

  constructor(scope: App, config: MedplumInfraConfig) {
    super(scope, config.stackName + '-us-east-1', {
      env: {
        region: 'us-east-1',
        account: config.accountNumber,
      },
    });
    Tags.of(this).add('medplum:environment', config.name);

    this.frontEnd = new FrontEnd(this, config, 'us-east-1');
    this.storage = new Storage(this, config, 'us-east-1');
    this.cloudTrail = new CloudTrailAlarms(this, config);
  }
}

export class MedplumCrossRegionStack extends Stack {
  constructor(scope: App, config: MedplumInfraConfig) {
    super(scope, config.stackName + '-cross-region', {
      env: {
        region: config.region,
        account: config.accountNumber,
      },
    });
    Tags.of(this).add('medplum:environment', config.name);

    // Add the CloudFront distribution OAI to S3 bucket policies
    // The buckets are in different regions, so we need to import them
    // The OAI is in the global region

    // App
    const appOaiCanonicalUserId = Fn.importValue('AppOriginAccessIdentityCanonicalUserId');
    grantBucketAccessToOriginAccessIdentity(
      s3.Bucket.fromBucketAttributes(this, 'AppBucket', {
        bucketName: config.appDomainName,
        region: config.region,
      }),
      appOaiCanonicalUserId
    );

    // Storage
    const storageOaiCanonicalUserId = Fn.importValue('StorageOriginAccessIdentityCanonicalUserId');
    grantBucketAccessToOriginAccessIdentity(
      s3.Bucket.fromBucketAttributes(this, 'StorageBucket', {
        bucketName: config.storageBucketName,
        region: config.region,
      }),
      storageOaiCanonicalUserId
    );
  }
}
