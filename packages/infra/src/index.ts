import { App, Stack } from 'aws-cdk-lib';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { BackEnd } from './backend';
import { MedplumInfraConfig } from './config';
import { FrontEnd } from './frontend';
import { Storage } from './storage';

class MedplumStack extends Stack {
  backEnd: BackEnd;
  frontEnd: FrontEnd;
  storage: Storage;

  constructor(scope: App, config: MedplumInfraConfig) {
    super(scope, config.stackName, {
      env: {
        region: config.region,
        account: config.accountNumber,
      },
    });

    this.backEnd = new BackEnd(this, config);
    this.frontEnd = new FrontEnd(this, config);
    this.storage = new Storage(this, config);
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

  console.log('Stack', stack.stackId);
  console.log('BackEnd', stack.backEnd.node.id);
  console.log('FrontEnd', stack.frontEnd.node.id);
  console.log('Storage', stack.storage.node.id);

  app.synth();
}

if (process.argv[1].endsWith('index.ts')) {
  main();
}
