import { AgentTransmitResponse } from '@medplum/core';
import { AgentChannel, Endpoint } from '@medplum/fhirtypes';

export interface Channel {
  start(): void;
  stop(): void;
  sendToRemote(message: AgentTransmitResponse): void;
  reloadConfig(definition: AgentChannel, endpoint: Endpoint): void;
}

export function needToRebindToPort(firstEndpoint: Endpoint, secondEndpoint: Endpoint): boolean {
  if (firstEndpoint.address === secondEndpoint.address) {
    return false;
  }

  const firstEndpointUrl = new URL(firstEndpoint.address);
  const secondEndpointUrl = new URL(secondEndpoint.address);

  if (firstEndpointUrl.port === secondEndpointUrl.port) {
    return true;
  }

  return true;
}
