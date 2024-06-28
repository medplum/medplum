import { randomUUID } from 'crypto';
import os from 'node:os';
import { globalLogger } from '../../logger';

let instanceId: string | undefined = undefined;
const hostname = os.hostname();

export async function fetchInstanceId(): Promise<string> {
  if (!instanceId) {
    const metadataEndpoint = process.env.ECS_CONTAINER_METADATA_URI_V4;
    if (!metadataEndpoint) {
      globalLogger.warn('ECS_CONTAINER_METADATA_URI_V4 env var not defined. Using random UUID for instance ID...');
      instanceId = randomUUID();
    } else {
      let response: Response;
      try {
        response = await fetch(metadataEndpoint);
      } catch (err) {
        throw new Error('Failed to fetch instance ID from metadata service', { cause: err });
      }
      const metadata = (await response.json()) as { DockerId: string };
      instanceId = metadata.DockerId;
    }
  }

  return instanceId;
}

export function getInstanceId(): string {
  return hostname;
}
