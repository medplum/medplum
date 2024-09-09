import { MedplumInfraConfig } from '@medplum/core';
import { App, Stack, Tags } from 'aws-cdk-lib';
import { BackEnd } from './backend';
import { CloudTrailAlarms } from './cloudtrail';
import { FrontEnd } from './frontend';
import { Storage } from './storage';

export class MedplumStack {
  primaryStack: MedplumPrimaryStack;
  globalStack?: MedplumGlobalStack;

  constructor(scope: App, config: MedplumInfraConfig) {
    this.primaryStack = new MedplumPrimaryStack(scope, config);

    if (config.region !== 'us-east-1') {
      // Some resources must be created in us-east-1
      // For example, CloudFront distributions and ACM certificates
      // If the primary region is not us-east-1, create these resources in us-east-1
      this.globalStack = new MedplumGlobalStack(scope, config);
      this.globalStack.addDependency(this.primaryStack);
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
