import { MedplumInfraConfig } from '@medplum/core';
import { readConfig, readServerConfig } from '../utils';
import { closeTerminal, initTerminal, print, yesOrNo } from './terminal';
import { printConfigNotFound, writeParameters } from './utils';

export interface UpdateConfigOptions {
  file?: string;
  dryrun?: boolean;
  yes?: boolean;
}

/**
 * The AWS "update-config" command updates AWS Parameter Store values with values from the local config file.
 * @param tag - The Medplum stack tag.
 * @param options - Additional command line options.
 */
export async function updateConfigCommand(tag: string, options: UpdateConfigOptions): Promise<void> {
  try {
    initTerminal();

    const infraConfig = readConfig(tag, options) as MedplumInfraConfig;
    if (!infraConfig) {
      printConfigNotFound(tag, options);
      throw new Error(`Config not found: ${tag}`);
    }

    const serverConfig = readServerConfig(tag) ?? {};

    checkConfigConflicts(infraConfig, serverConfig);
    mergeConfigs(infraConfig, serverConfig);

    print('Medplum uses AWS Parameter Store to store sensitive configuration values.');
    print('These values will be encrypted at rest.');
    print(`The values will be stored in the "/medplum/${infraConfig.name}" path.`);

    print(
      JSON.stringify(
        {
          ...serverConfig,
          signingKey: '****',
          signingKeyPassphrase: '****',
        },
        null,
        2
      )
    );

    if (options.yes || (await yesOrNo('Do you want to store these values in AWS Parameter Store?'))) {
      await writeParameters(
        infraConfig.region,
        `/medplum/${infraConfig.name}/`,
        serverConfig as Record<string, string | number>
      );
    }
  } finally {
    closeTerminal();
  }
}

export function checkConfigConflicts(
  infraConfig: MedplumInfraConfig,
  serverConfig: Record<string, string | number>
): void {
  checkConflict(
    infraConfig.apiPort,
    serverConfig.port,
    `Infra "apiPort" (${infraConfig.apiPort}) does not match server "port" (${serverConfig.port})`
  );

  checkConflict(
    infraConfig.baseUrl,
    serverConfig.baseUrl,
    `Infra "baseUrl" (${infraConfig.baseUrl}) does not match server "baseUrl" (${serverConfig.baseUrl})`
  );

  checkConflict(
    infraConfig.appDomainName && `https://${infraConfig.appDomainName}/`,
    serverConfig.appBaseUrl,
    `Infra "appDomainName" (${infraConfig.appDomainName}) does not match server "appBaseUrl" (${serverConfig.appBaseUrl})`
  );

  checkConflict(
    infraConfig.storageDomainName && `https://${infraConfig.storageDomainName}/binary/`,
    serverConfig.storageBaseUrl,
    `Infra "storageDomainName" (${infraConfig.storageDomainName}) does not match server "storageBaseUrl" (${serverConfig.storageBaseUrl})`
  );
}

function checkConflict<T>(a: T, b: T, message: string): void {
  if (isConflict(a, b)) {
    throw new Error(message);
  }
}

function isConflict<T>(a: T, b: T): boolean {
  return a !== undefined && b !== undefined && a !== b;
}

export function mergeConfigs(infraConfig: MedplumInfraConfig, serverConfig: Record<string, string | number>): void {
  if (infraConfig.apiPort) {
    serverConfig.port = infraConfig.apiPort;
  }
  if (infraConfig.baseUrl) {
    serverConfig.baseUrl = infraConfig.baseUrl;
  }
  if (infraConfig.appDomainName) {
    serverConfig.appBaseUrl = `https://${infraConfig.appDomainName}/`;
  }
  if (infraConfig.storageDomainName) {
    serverConfig.storageBaseUrl = `https://${infraConfig.storageDomainName}/`;
  }
}
