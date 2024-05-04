import { AgentTransmitResponse, Logger } from '@medplum/core';
import { AgentChannel, Endpoint } from '@medplum/fhirtypes';

export interface Channel {
  readonly log: Logger;
  start(): void;
  stop(): Promise<void>;
  sendToRemote(message: AgentTransmitResponse): void;
  reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void>;
  getDefinition(): AgentChannel;
  getEndpoint(): Endpoint;
}

export function needToRebindToPort(firstEndpoint: Endpoint, secondEndpoint: Endpoint): boolean {
  if (
    firstEndpoint.address === secondEndpoint.address ||
    new URL(firstEndpoint.address).port === new URL(secondEndpoint.address).port
  ) {
    return false;
  }
  return true;
}
