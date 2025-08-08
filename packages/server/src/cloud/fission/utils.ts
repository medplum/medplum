// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CustomObjectsApi, KubeConfig, PatchStrategy, setHeaderOptions } from '@kubernetes/client-node';
import fetch from 'node-fetch';
import { getConfig } from '../../config/loader';
import { MedplumFissionConfig } from '../../config/types';
import { getLogger } from '../../logger';

const FISSION_GROUP = 'fission.io';
const FISSION_VERSION = 'v1';
const FISSION_API_VERSION = `${FISSION_GROUP}/${FISSION_VERSION}`;

const plurals = {
  Package: 'packages',
  Function: 'functions',
  HTTPTrigger: 'httptriggers',
} as const;

const getPackageName = (id: string): string => `bot-package-${id}-${Date.now()}`;
const getFunctionName = (id: string): string => `bot-function-${id}`;
const getTriggerName = (id: string): string => `bot-trigger-${id}`;
const getRelativeUrl = (id: string): string => `/bot-${id}`;

/**
 * Returns the Fission configuration from the Medplum configuration.
 * Throws an error if Fission is not enabled in the configuration.
 * @returns The Fission configuration object.
 */
export function getFissionConfig(): MedplumFissionConfig {
  const config = getConfig().fission;
  if (!config) {
    throw new Error('Fission bots are not enabled');
  }
  return config;
}

/**
 * Deploys a Fission function with the given ID and function code.
 * This function creates a Fission package, function, and HTTP trigger.
 * It uses server-side apply to ensure the resources are created or updated as needed.
 *
 * @param id - A unique identifier for the Fission function, used to generate names for the package, function, and trigger.
 * @param zipFile - The function code as a Uint8Array, which will be encoded in base64 and used as the deployment literal.
 */
export async function deployFissionFunction(id: string, zipFile: Uint8Array): Promise<void> {
  const config = getFissionConfig();
  const logger = getLogger();

  const kc = new KubeConfig();
  kc.loadFromDefault();

  const k8sApi = kc.makeApiClient(CustomObjectsApi);

  function createObject(kind: string, name: string, spec: any): Promise<any> {
    return k8sApi.createNamespacedCustomObject({
      group: FISSION_GROUP,
      version: FISSION_VERSION,
      namespace: config.namespace,
      plural: plurals[kind as keyof typeof plurals],
      body: {
        apiVersion: FISSION_API_VERSION,
        kind,
        metadata: {
          namespace: config.namespace,
          name,
        },
        spec,
      },
    });
  }

  function applyPatch(kind: string, name: string, spec: any): Promise<any> {
    return k8sApi.patchNamespacedCustomObject(
      {
        group: FISSION_GROUP,
        version: FISSION_VERSION,
        namespace: config.namespace,
        plural: plurals[kind as keyof typeof plurals],
        name,
        fieldManager: config.fieldManager,
        force: true,
        body: {
          apiVersion: FISSION_API_VERSION,
          kind,
          metadata: {
            namespace: config.namespace,
            name,
          },
          spec,
        },
      },
      setHeaderOptions('Content-Type', PatchStrategy.ServerSideApply)
    );
  }

  const packageName = getPackageName(id);
  const functionName = getFunctionName(id);
  const triggerName = getTriggerName(id);
  const relativeUrl = getRelativeUrl(id);

  const newPackage = await createObject('Package', packageName, {
    environment: {
      name: config.environmentName,
      namespace: config.namespace,
    },
    source: {
      type: 'literal',
      literal: Buffer.from(zipFile).toString('base64'),
    },
    deployment: null, // Clear existing deployment info
  });
  logger.debug('Created Fission Package', { package: newPackage });

  const newFunction = await applyPatch('Function', functionName, {
    environment: {
      name: config.environmentName,
      namespace: config.namespace,
    },
    package: {
      functionName: 'index',
      packageref: {
        name: packageName,
        namespace: config.namespace,
        resourceversion: newPackage.metadata?.resourceVersion,
      },
    },
    InvokeStrategy: {
      ExecutionStrategy: {
        ExecutorType: 'poolmgr',
        MinScale: 0,
        MaxScale: 1,
        SpecializationTimeout: 120,
      },
      StrategyType: 'execution',
    },
    concurrency: 500,
    requestsPerPod: 1,
    functionTimeout: 60,
    idletimeout: 120,
  });
  logger.debug('Upserted Fission Function', { function: newFunction });

  const newTrigger = await applyPatch('HTTPTrigger', triggerName, {
    functionref: {
      name: functionName,
      type: 'name',
    },
    methods: ['POST'],
    relativeurl: relativeUrl,
  });
  logger.debug('Upserted Fission HTTP Trigger', { trigger: newTrigger });
}

/**
 * Executes a Fission function by invoking it via HTTPTrigger.
 * @param id - The unique identifier for the Fission function to be invoked.
 * @param body - The request body to be sent to the function.
 * @returns A promise that resolves to the response body from the Fission function.
 */
export async function executeFissionFunction(id: string, body: string): Promise<string> {
  const config = getFissionConfig();

  const relativeUrl = getRelativeUrl(id);

  const url = `http://${config.routerHost}:${config.routerPort}${relativeUrl}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
  }

  const data = await response.text();
  return data;
}
