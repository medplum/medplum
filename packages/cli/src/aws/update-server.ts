import { MedplumInfraConfig } from '@medplum/core';
import { spawnSync } from 'child_process';
import * as semver from 'semver';
import { createMedplumClient } from '../util/client';
import { getConfigFileName, readConfig, writeConfig } from '../utils';
import { getServerVersions } from './utils';

/**
 * The AWS "update-server" command updates the Medplum server in a Medplum CloudFormation stack.
 * @param tag - The Medplum stack tag.
 * @param options - Client options
 */
export async function updateServerCommand(tag: string, options: any): Promise<void> {
  const client = await createMedplumClient(options);
  const config = readConfig(tag) as MedplumInfraConfig;
  if (!config) {
    console.log(`Configuration file ${getConfigFileName(tag)} not found`);
    return;
  }
  const separatorIndex = config.serverImage.lastIndexOf(':');
  let initialVersion = config.serverImage.slice(separatorIndex + 1);
  if (initialVersion === 'latest') {
    const serverInfo = JSON.parse(await client.get('/healthcheck'));
    initialVersion = serverInfo.version as string;
    const sep = initialVersion.indexOf('-');
    if (sep > -1) {
      initialVersion = initialVersion.slice(0, sep);
    }
  }
  let updateVersion = await nextUpdateVersion(initialVersion);
  while (updateVersion) {
    console.log(`Performing update to v${updateVersion}`);
    config.serverImage = `${config.serverImage.slice(0, separatorIndex)}:${updateVersion}`;
    deployServerUpdate(tag, config);
    // Run data migrations
    await client.startAsyncRequest('/admin/super/migrate');

    updateVersion = await nextUpdateVersion(updateVersion);
  }
}

async function nextUpdateVersion(currentVersion: string): Promise<string | undefined> {
  return (await getServerVersions(currentVersion))
    .filter((v) => semver.gte(v, semver.inc(currentVersion, 'minor') as string))
    .pop();
}

function deployServerUpdate(tag: string, config: MedplumInfraConfig): void {
  const configFile = getConfigFileName(tag);
  writeConfig(configFile, config);

  const cmd = `npx cdk deploy -c config=${configFile}${config.region !== 'us-east-1' ? ' --all' : ''}`;
  console.log('> ' + cmd);
  const deploy = spawnSync(cmd, { stdio: 'inherit' });

  if (deploy.status !== 0) {
    throw new Error(`Deploy of ${config.serverImage} failed (exit code ${deploy.status}): ${deploy.stderr}`);
  }
  console.log(deploy.stdout);
}
