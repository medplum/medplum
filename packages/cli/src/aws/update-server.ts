import { MedplumClient, MedplumClientOptions, MedplumInfraConfig } from '@medplum/core';
import { spawnSync } from 'node:child_process';
import * as semver from 'semver';
import { createMedplumClient } from '../util/client';
import { getConfigFileName, readConfig, writeConfig } from '../utils';
import { getServerVersions, printConfigNotFound } from './utils';

export interface UpdateServerOptions extends MedplumClientOptions {
  file?: string;
  toVersion?: string;
}

/**
 * The AWS "update-server" command updates the Medplum server in a Medplum CloudFormation stack.
 * @param tag - The Medplum stack tag.
 * @param options - Client options
 */
export async function updateServerCommand(tag: string, options: UpdateServerOptions): Promise<void> {
  const client = await createMedplumClient(options);
  const config = readConfig(tag, options) as MedplumInfraConfig;
  if (!config) {
    console.log(`Configuration file ${getConfigFileName(tag)} not found`);
    printConfigNotFound(tag, options);
    throw new Error(`Config not found: ${tag}`);
  }

  const separatorIndex = config.serverImage.lastIndexOf(':');
  const serverImagePrefix = config.serverImage.slice(0, separatorIndex);

  const initialVersion = await getCurrentVersion(client, config);

  let updateVersion = await nextUpdateVersion(initialVersion);
  while (updateVersion) {
    if (options.toVersion && semver.gt(updateVersion, options.toVersion)) {
      console.log(`Skipping update to v${updateVersion}`);
      break;
    }

    console.log(`Performing update to v${updateVersion}`);
    config.serverImage = `${serverImagePrefix}:${updateVersion}`;
    deployServerUpdate(tag, config);

    // Run data migrations
    await client.startAsyncRequest('/admin/super/migrate');

    updateVersion = await nextUpdateVersion(updateVersion);
  }
}

async function getCurrentVersion(medplum: MedplumClient, config: MedplumInfraConfig): Promise<string> {
  const separatorIndex = config.serverImage.lastIndexOf(':');
  let initialVersion = config.serverImage.slice(separatorIndex + 1);
  if (initialVersion === 'latest') {
    const serverInfo = await medplum.get('/healthcheck');
    initialVersion = serverInfo.version as string;
    const sep = initialVersion.indexOf('-');
    if (sep > -1) {
      initialVersion = initialVersion.slice(0, sep);
    }
  }
  return initialVersion;
}

async function nextUpdateVersion(currentVersion: string, targetVersion?: string): Promise<string | undefined> {
  // The list of server versions is sorted in descending order
  // The first entry is the latest version
  // The last entry is the oldest version
  // We want to find the "next" version after our current version
  // Filter the list to only include versions that are greater than or equal to the current minor version
  // Then pop the last entry from the list
  const allVersions = await getServerVersions(currentVersion);
  const latestVersion = allVersions[0];
  return allVersions
    .filter(
      (v) => v === latestVersion || v === targetVersion || semver.gte(v, semver.inc(currentVersion, 'minor') as string)
    )
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
