import * as cdk from '@aws-cdk/core';
import { BackEnd } from './backend';
import { ACCOUNT_NUMBER, REGION } from './constants';
import { FrontEnd } from './frontend';
import { Storage } from './storage';

class MedplumStack extends cdk.Stack {
  backEnd: BackEnd;
  frontEnd: FrontEnd;
  storage: Storage;

  constructor(scope: cdk.App, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.backEnd = new BackEnd(this, 'BackEnd');
    this.frontEnd = new FrontEnd(this, 'FrontEnd');
    this.storage = new Storage(this, 'Storage');
  }
}

export function main(): void {
  const app = new cdk.App();

  const stack = new MedplumStack(app, 'MedplumStack', {
    env: {
      region: REGION,
      account: ACCOUNT_NUMBER,
    },
  });

  console.log('Stack', stack.stackId);
  console.log('BackEnd', stack.backEnd.id);
  console.log('FrontEnd', stack.frontEnd.id);
  console.log('Storage', stack.storage.id);

  app.synth();
}

main();
