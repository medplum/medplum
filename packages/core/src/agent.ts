import { normalizeErrorString } from './outcomes';

export const GITHUB_RELEASES_URL = 'https://api.github.com/repos/medplum/medplum/releases';

const releaseManifests = new Map<string, ReleaseManifest>();

export function clearReleaseCache(): void {
  releaseManifests.clear();
}

export function assertReleaseManifest(candidate: unknown): asserts candidate is ReleaseManifest {
  const manifest = candidate as ReleaseManifest;
  if (!manifest.tag_name) {
    throw new Error('Manifest missing tag_name');
  }
  const assets = manifest.assets;
  if (!assets?.length) {
    throw new Error('Manifest missing assets list');
  }
  for (const asset of assets) {
    if (!asset.browser_download_url) {
      throw new Error('Asset missing browser download URL');
    }
    if (!asset.name) {
      throw new Error('Asset missing name');
    }
  }
}

/**
 * @param version - The version to fetch. If no `version` is provided, defaults to the `latest` version.
 * @returns - The manifest for the specified or latest version.
 */
export async function fetchVersionManifest(version?: string): Promise<ReleaseManifest> {
  let manifest = releaseManifests.get(version ?? 'latest');
  if (!manifest) {
    const versionTag = version ? `tags/v${version}` : 'latest';
    const res = await fetch(`${GITHUB_RELEASES_URL}/${versionTag}`);
    if (res.status !== 200) {
      let message: string | undefined;
      try {
        message = ((await res.json()) as { message: string }).message;
      } catch (err) {
        console.error(`Failed to parse message from body: ${normalizeErrorString(err)}`);
      }
      throw new Error(
        `Received status code ${res.status} while fetching manifest for version '${version ?? 'latest'}'. Message: ${message}`
      );
    }
    const response = (await res.json()) as ReleaseManifest;
    assertReleaseManifest(response);
    manifest = response;
    releaseManifests.set(version ?? 'latest', manifest);
    if (!version) {
      releaseManifests.set(manifest.tag_name.slice(1), manifest);
    }
  }
  return manifest;
}

export function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

export async function checkIfValidMedplumVersion(version: string): Promise<boolean> {
  if (!isValidSemver(version)) {
    return false;
  }
  try {
    await fetchVersionManifest(version);
  } catch (_err) {
    return false;
  }
  return true;
}

export async function fetchLatestVersionString(): Promise<string> {
  const latest = await fetchVersionManifest();
  if (!latest.tag_name.startsWith('v')) {
    throw new Error(`Invalid release name found. Release tag '${latest.tag_name}' did not start with 'v'`);
  }
  return latest.tag_name.slice(1);
}

export interface BaseAgentMessage {
  type: string;
  callback?: string;
}

export interface BaseAgentRequestMessage extends BaseAgentMessage {
  accessToken?: string;
}

export interface AgentError extends BaseAgentMessage {
  type: 'agent:error';
  body: string;
}

export interface AgentConnectRequest extends BaseAgentRequestMessage {
  type: 'agent:connect:request';
  agentId: string;
}

export interface AgentConnectResponse extends BaseAgentMessage {
  type: 'agent:connect:response';
}

export interface AgentHeartbeatRequest extends BaseAgentRequestMessage {
  type: 'agent:heartbeat:request';
}

export interface AgentHeartbeatResponse extends BaseAgentMessage {
  type: 'agent:heartbeat:response';
  version: string;
}

export interface AgentTransmitRequest extends BaseAgentRequestMessage {
  type: 'agent:transmit:request';
  channel?: string;
  remote: string;
  contentType: string;
  body: string;
}

export interface AgentTransmitResponse extends BaseAgentMessage {
  type: 'agent:transmit:response';
  channel?: string;
  remote: string;
  contentType: string;
  statusCode?: number;
  body: string;
}

export interface AgentReloadConfigRequest extends BaseAgentRequestMessage {
  type: 'agent:reloadconfig:request';
}

export interface AgentReloadConfigResponse extends BaseAgentMessage {
  type: 'agent:reloadconfig:response';
  statusCode: number;
}

export interface AgentUpgradeRequest extends BaseAgentRequestMessage {
  type: 'agent:upgrade:request';
  version?: string;
}

export interface AgentUpgradeResponse extends BaseAgentMessage {
  type: 'agent:upgrade:response';
  statusCode: number;
}

export type AgentRequestMessage =
  | AgentConnectRequest
  | AgentHeartbeatRequest
  | AgentTransmitRequest
  | AgentReloadConfigRequest
  | AgentUpgradeRequest;

export type AgentResponseMessage =
  | AgentConnectResponse
  | AgentHeartbeatResponse
  | AgentTransmitResponse
  | AgentReloadConfigResponse
  | AgentUpgradeResponse
  | AgentError;

export type AgentMessage = AgentRequestMessage | AgentResponseMessage;

export type ReleaseManifest = { tag_name: string; assets: { name: string; browser_download_url: string }[] };
