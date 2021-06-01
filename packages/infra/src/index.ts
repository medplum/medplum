import * as cdk from '@aws-cdk/core';
import { BackEnd } from './backend';
import { ACCOUNT_NUMBER, REGION } from './constants';

class MedplumStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    new BackEnd(this, 'BackEnd');
  }
}

function main() {
  const app = new cdk.App();

  new MedplumStack(app, 'MedplumStack', {
    env: {
      region: REGION,
      account: ACCOUNT_NUMBER
    }
  });

  app.synth();
}

main();
