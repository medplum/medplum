import { CustomObjectsApi, KubeConfig, PatchStrategy, setHeaderOptions } from '@kubernetes/client-node';
import fetch from 'node-fetch';
import { getLogger } from '../../logger';

const FISSION_GROUP = 'fission.io';
const FISSION_VERSION = 'v1';
const FISSION_API_VERSION = `${FISSION_GROUP}/${FISSION_VERSION}`;

export interface FissionConfig {
  readonly namespace: string;
  readonly fieldManager: string;
  readonly environmentName: string;
  readonly routerHost: string;
  readonly routerPort: number;
}

const config: FissionConfig = {
  namespace: 'default', // Change this to your desired namespace
  fieldManager: 'medplum-fission-example', // Change this to your desired field manager name
  environmentName: 'nodejs', // Change this to your desired Fission environment name
  routerHost: 'localhost', // Change this to your Fission router host
  routerPort: 31314, // Change this to your Fission router port
};

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
 * Deploys a Fission function with the given ID and function code.
 * This function creates a Fission package, function, and HTTP trigger.
 * It uses server-side apply to ensure the resources are created or updated as needed.
 *
 * @param id - A unique identifier for the Fission function, used to generate names for the package, function, and trigger.
 * @param zipFile - The function code as a Uint8Array, which will be encoded in base64 and used as the deployment literal.
 */
export async function deployFissionFunction(id: string, zipFile: Uint8Array): Promise<void> {
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
  const relativeUrl = getRelativeUrl(id);

  // **IMPORTANT: Determine the Fission Router's IP and Port.**
  // As per your `kubectl get svc -n fission` output, `router` is a NodePort service.
  // Its NodePort is 31314.
  // To access this from your local machine (outside the cluster), you need the IP address of a Kubernetes node.
  // In Docker Desktop, this is usually `localhost` or `127.0.0.1`.

  // const fissionRouterHost = "localhost"; // For Docker Desktop Kubernetes
  // const fissionRouterPort = 31314; // The NodePort exposed by the router service

  // If your server app runs *inside* the Kubernetes cluster, you would use:
  // const fissionRouterHost = "router.fission.svc.cluster.local"; // Fission router's internal ClusterIP service name
  // const fissionRouterPort = 80; // The internal service port

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
