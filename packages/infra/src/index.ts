import * as cdk from '@aws-cdk/core';
import { BackEnd } from './backend';
import { ACCOUNT_NUMBER, REGION } from './constants';

class MedplumStack extends cdk.Stack {
  backEnd: BackEnd;

  constructor(scope: cdk.App, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.backEnd = new BackEnd(this, 'BackEnd');
  }
}

export function main() {
  const app = new cdk.App();

  const stack = new MedplumStack(app, 'MedplumStack', {
    env: {
      region: REGION,
      account: ACCOUNT_NUMBER
    }
  });

  console.log('Stack', stack.stackId);
  console.log('BackEnd', stack.backEnd.id);

  return app.synth();
}

main();
