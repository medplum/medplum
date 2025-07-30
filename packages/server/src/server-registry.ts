import { MEDPLUM_VERSION } from '@medplum/core';
import { randomUUID } from 'crypto';
import { heartbeat } from './heartbeat';
import { getRedis } from './redis';
import { getServerVersion } from './util/version';

const SERVER_REGISTRY_KEY_PREFIX = 'medplum:server-registry:';
const SERVER_REGISTRY_TTL_SECONDS = 60;

export type ServerRegistryInfo = {
  /* Unique identifier for a server instance */
  id: string;
  /* Timestamp of the first heartbeat */
  firstSeen: string;
  /* Timestamp of the last heartbeat */
  lastSeen: string;
  /* Semver version of Medplum the server is running */
  version: string;
  /* Full version (semver + build commit hash) of Medplum the server is running */
  fullVersion: string;
};

export async function setServerRegistryPayload(value: ServerRegistryInfo): Promise<void> {
  const redis = getRedis();
  await redis.setex(SERVER_REGISTRY_KEY_PREFIX + value.id, SERVER_REGISTRY_TTL_SECONDS, JSON.stringify(value));
}

let serverRegistryHeartbeatListener: (() => Promise<void>) | undefined;

let registryPayload: ServerRegistryInfo | undefined;

function getServerRegistryPayload(): ServerRegistryInfo {
  const now = new Date().toISOString();
  registryPayload ??= {
    id: randomUUID(),
    firstSeen: now,
    lastSeen: now,
    version: getServerVersion(),
    fullVersion: MEDPLUM_VERSION,
  };
  registryPayload.lastSeen = now;
  return registryPayload;
}

export function initServerRegistryHeartbeatListener(): void {
  if (serverRegistryHeartbeatListener) {
    return;
  }

  serverRegistryHeartbeatListener = async () => {
    const payload = getServerRegistryPayload();
    await setServerRegistryPayload(payload);
  };
  heartbeat.addEventListener('heartbeat', serverRegistryHeartbeatListener);
}

export function cleanupServerRegistryHeartbeatListener(): void {
  if (serverRegistryHeartbeatListener) {
    heartbeat.removeEventListener('heartbeat', serverRegistryHeartbeatListener);
    serverRegistryHeartbeatListener = undefined;
  }
}

export type ServerRegistryInfoWithComputed = ServerRegistryInfo & {
  firstSeenAgeMs: number;
  lastSeenAgeMs: number;
};

export type ClusterStatus = {
  timestamp: string;
  totalServers: number;
  versions: Record<string, number>;
  oldestVersion: string | undefined;
  newestVersion: string | undefined;
  isHomogeneous: boolean;
  servers: ServerRegistryInfoWithComputed[];
};

/**
 * @param ensureSelf - If true, includes the current process in the list of registered servers, even
 * if it has not registered within the last minute.
 * @returns A list of registered servers.
 */
export async function getRegisteredServers(ensureSelf: boolean): Promise<ServerRegistryInfo[]> {
  const redis = getRedis();
  const servers: ServerRegistryInfo[] = [];
  const keys = await redis.keys(SERVER_REGISTRY_KEY_PREFIX + '*');

  // `redis.mget` throws an error if keys is empty
  if (keys.length > 0) {
    const payloads = await redis.mget(keys);
    for (const payload of payloads) {
      if (payload) {
        servers.push(JSON.parse(payload));
      }
    }
  }

  if (ensureSelf) {
    const self = getServerRegistryPayload();
    if (!servers.find((s) => s.id === self.id)) {
      servers.push(self);
    }
  }

  return servers;
}

function addComputedFields(now: number, server: ServerRegistryInfo): ServerRegistryInfoWithComputed {
  return {
    ...server,
    lastSeenAgeMs: now - new Date(server.lastSeen).getTime(),
    firstSeenAgeMs: now - new Date(server.firstSeen).getTime(),
  };
}

function getServersByVersion(servers: ServerRegistryInfo[]): Record<string, ServerRegistryInfo[]> {
  const versionMap: Record<string, ServerRegistryInfo[]> = {};
  for (const server of servers) {
    versionMap[server.fullVersion] ??= [];
    versionMap[server.fullVersion].push(server);
  }
  return versionMap;
}

export async function getClusterStatus(servers: ServerRegistryInfo[]): Promise<ClusterStatus> {
  servers.sort((a, b) => a.fullVersion.localeCompare(b.fullVersion));
  const versionMap = getServersByVersion(servers);
  const versions = Object.keys(versionMap).sort((a, b) => a.localeCompare(b));
  const versionCounts = versions.reduce((versionCounts: Record<string, number>, version) => {
    versionCounts[version] = versionMap[version].length;
    return versionCounts;
  }, {});

  const now = Date.now();
  return {
    timestamp: new Date().toISOString(),
    totalServers: servers.length,
    versions: versionCounts,
    oldestVersion: versions[0],
    newestVersion: versions[versions.length - 1],
    isHomogeneous: versions.length === 1,
    servers: servers.map((server) => addComputedFields(now, server)),
  };
}
