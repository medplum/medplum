// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumSourceInfraConfig } from '@medplum/core';
import { App } from 'aws-cdk-lib';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { normalizeInfraConfig } from './config';
import { MedplumStack } from './stack';

export * from './backend';
export * from './cloudtrail';
export * from './frontend';
export * from './stack';
export * from './storage';
export * from './waf';

export async function main(context?: Record<string, string>): Promise<void> {
  const app = new App({ context });

  const configFileName = app.node.tryGetContext('config');
  if (!configFileName) {
    console.log('Missing "config" context variable');
    console.log('Usage: cdk deploy -c config=my-config.json');
    return;
  }

  const config = JSON.parse(readFileSync(resolve(configFileName), 'utf-8')) as MedplumSourceInfraConfig;
  const normalizedConfig = await normalizeInfraConfig(config);
  const stack = new MedplumStack(app, normalizedConfig);
  console.log('Stack', stack.primaryStack.stackId);
  app.synth();
}

if (require.main === module) {
  main().catch(console.error);
}
