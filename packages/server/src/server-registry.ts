import { MEDPLUM_VERSION, WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { getConfig } from './config/loader';
import { DatabaseMode, getDatabasePool } from './database';
import { getSystemRepo } from './fhir/repo';
import { heartbeat } from './heartbeat';
import { globalLogger } from './logger';
import { getPendingPostDeployMigration, queuePostDeployMigration } from './migrations/migration-utils';
import { MigrationVersion } from './migrations/migration-versions';
import { getRedis } from './redis';
import { getServerVersion } from './util/version';

const SERVER_REGISTRY_KEY_PREFIX = 'medplum:server-registry';
const SERVER_REGISTRY_TTL_SECONDS = 60;

type ServerRegistryInfo = {
  /* Unique identifier for a server instance */
  id: string;
  /* Semver version of Medplum the server is running */
  version: string;
  /* Full version (semver + build commit hash) of Medplum the server is running */
  fullVersion: string;
};

export type ClusterStatus = {
  timestamp: string;
  totalServers: number;
  versions: Record<string, number>;
  oldestVersion: string | undefined;
  newestVersion: string | undefined;
  isHomogeneous: boolean;
  servers: ServerRegistryInfo[];
};

export async function getRegisteredServers(): Promise<ServerRegistryInfo[]> {
  const redis = getRedis();
  const servers: ServerRegistryInfo[] = [];
  const keys = await redis.keys(SERVER_REGISTRY_KEY_PREFIX + ':*');
  const payloads = await redis.mget(keys);
  for (const payload of payloads) {
    if (payload) {
      servers.push(JSON.parse(payload));
    }
  }
  return servers;
}

function getServersByVersion(servers: ServerRegistryInfo[]): Record<string, ServerRegistryInfo[]> {
  const versionMap: Record<string, ServerRegistryInfo[]> = {};

  servers.forEach((server) => {
    if (!versionMap[server.fullVersion]) {
      versionMap[server.fullVersion] = [];
    }
    versionMap[server.fullVersion].push(server);
  });

  return versionMap;
}

export async function getClusterStatus(): Promise<ClusterStatus> {
  const servers = await getRegisteredServers();
  const versionMap = await getServersByVersion(servers);
  const versions = Object.keys(versionMap).sort();
  const versionCounts = versions.reduce((versionCounts: Record<string, number>, version) => {
    versionCounts[version] = versionMap[version].length;
    return versionCounts;
  }, {});

  return {
    timestamp: new Date().toISOString(),
    totalServers: servers.length,
    versions: versionCounts,
    oldestVersion: versions[0],
    newestVersion: versions[versions.length - 1],
    isHomogeneous: versions.length === 1,
    servers: servers.sort((a, b) => a.fullVersion.localeCompare(b.fullVersion)),
  };
}

export async function setServerRegistryPayload(value: ServerRegistryInfo): Promise<void> {
  const redis = getRedis();
  await redis.setex(SERVER_REGISTRY_KEY_PREFIX + ':' + value.id, SERVER_REGISTRY_TTL_SECONDS, JSON.stringify(value));
}

let serverRegistryHeartbeatListener: (() => Promise<void>) | undefined;

let registryPayload: ServerRegistryInfo | undefined;

let shouldCheckForPendingPostDeployMigration = false;

export async function initServerRegistryHeartbeatListener(): Promise<void> {
  if (serverRegistryHeartbeatListener) {
    return;
  }

  const config = getConfig();
  const isDisabled = config.database.runMigrations === false || config.database.disableRunPostDeployMigrations;
  shouldCheckForPendingPostDeployMigration = !isDisabled;

  serverRegistryHeartbeatListener = async () => {
    if (!registryPayload) {
      registryPayload = {
        id: randomUUID(),
        version: getServerVersion(),
        fullVersion: MEDPLUM_VERSION,
      };
    }
    await setServerRegistryPayload(registryPayload);

    if (shouldCheckForPendingPostDeployMigration) {
      const result = await maybeRunPendingPostDeployMigration();
      shouldCheckForPendingPostDeployMigration = Boolean(result);
    }
  };
  heartbeat.addEventListener('heartbeat', serverRegistryHeartbeatListener);
}

export function cleanupServerRegistryHeartbeatListener(): void {
  if (serverRegistryHeartbeatListener) {
    heartbeat.removeEventListener('heartbeat', serverRegistryHeartbeatListener);
    serverRegistryHeartbeatListener = undefined;
    registryPayload = undefined;
  }
}

/**
 * @returns The AsyncJob if the post-deploy migration was started, `true` if the cluster is not yet homogeneous, `false` if there are no pending post-deploy migrations
 */
async function maybeRunPendingPostDeployMigration(): Promise<WithId<AsyncJob> | boolean> {
  const pendingPostDeployMigration = await getPendingPostDeployMigration(getDatabasePool(DatabaseMode.WRITER));
  if (pendingPostDeployMigration === MigrationVersion.UNKNOWN) {
    //throwing here seems extreme since it stops the server from starting
    // if this somehow managed to trigger, but arriving here would mean something
    // is pretty wrong, so throwing is probably the correct behavior?
    throw new Error('Cannot run post-deploy migrations; next post-deploy migration version is unknown');
  }

  if (pendingPostDeployMigration === MigrationVersion.NONE) {
    globalLogger.debug('No pending post-deploy migrations');
    return false;
  }

  const clusterStatus = await getClusterStatus();
  console.log(clusterStatus);

  if (!clusterStatus.isHomogeneous) {
    globalLogger.info('Not auto-queueing pending post-deploy migration because cluster is not homogeneous', {
      version: `v${pendingPostDeployMigration}`,
      clusterStatus,
    });
    return true;
  }

  const systemRepo = getSystemRepo();
  globalLogger.debug('Auto-queueing pending post-deploy migration', { version: `v${pendingPostDeployMigration}` });
  return queuePostDeployMigration(systemRepo, pendingPostDeployMigration);
}
