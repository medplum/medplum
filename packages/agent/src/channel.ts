import { AgentTransmitResponse } from '@medplum/core';

export interface Channel {
  start(): void;
  stop(): void;
  sendToRemote(message: AgentTransmitResponse): void;
}
