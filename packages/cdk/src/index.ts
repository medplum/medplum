import { MedplumInfraConfig } from '@medplum/core';
import { App, Stack, Tags } from 'aws-cdk-lib';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { BackEnd } from './backend';
import { FrontEnd } from './frontend';
import { Storage } from './storage';
import { CloudTrailAlarms } from './cloudtrail';

class MedplumStack {
  primaryStack: Stack;
  backEnd: BackEnd;
  frontEnd: FrontEnd;
  storage: Storage;
  cloudTrail: CloudTrailAlarms;

  constructor(scope: App, config: MedplumInfraConfig) {
    this.primaryStack = new Stack(scope, config.stackName, {
      env: {
        region: config.region,
        account: config.accountNumber,
      },
    });
    Tags.of(this.primaryStack).add('medplum:environment', config.name);

    this.backEnd = new BackEnd(this.primaryStack, config);
    this.frontEnd = new FrontEnd(this.primaryStack, config, config.region);
    this.storage = new Storage(this.primaryStack, config, config.region);
    this.cloudTrail = new CloudTrailAlarms(this.primaryStack, config);

    if (config.region !== 'us-east-1') {
      // Some resources must be created in us-east-1
      // For example, CloudFront distributions and ACM certificates
      // If the primary region is not us-east-1, create these resources in us-east-1
      const usEast1Stack = new Stack(scope, config.stackName + '-us-east-1', {
        env: {
          region: 'us-east-1',
          account: config.accountNumber,
        },
      });
      Tags.of(usEast1Stack).add('medplum:environment', config.name);

      this.frontEnd = new FrontEnd(usEast1Stack, config, 'us-east-1');
      this.storage = new Storage(usEast1Stack, config, 'us-east-1');
      this.cloudTrail = new CloudTrailAlarms(usEast1Stack, config);
    }
  }
}

export function main(context?: Record<string, string>): void {
  const app = new App({ context });

  const configFileName = app.node.tryGetContext('config');
  if (!configFileName) {
    console.log('Missing "config" context variable');
    console.log('Usage: cdk deploy -c config=my-config.json');
    return;
  }

  const config = JSON.parse(readFileSync(resolve(configFileName), 'utf-8')) as MedplumInfraConfig;

  const stack = new MedplumStack(app, config);

  console.log('Stack', stack.primaryStack.stackId);
  console.log('BackEnd', stack.backEnd.node.id);
  console.log('FrontEnd', stack.frontEnd.node.id);
  console.log('Storage', stack.storage.node.id);
  console.log('CloudTrail', stack.cloudTrail.node.id);

  app.synth();
}

if (require.main === module) {
  main();
}
