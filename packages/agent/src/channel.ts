import { AgentTransmitResponse, Logger } from '@medplum/core';
import { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import { App } from './app';

export interface Channel {
  readonly log: Logger;
  start(): void;
  stop(): Promise<void>;
  sendToRemote(message: AgentTransmitResponse): void;
  reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void>;
  getDefinition(): AgentChannel;
  getEndpoint(): Endpoint;
}

export abstract class BaseChannel implements Channel {
  private definition: AgentChannel;
  private endpoint: Endpoint;

  constructor(
    readonly app: App,
    definition: AgentChannel,
    endpoint: Endpoint
  ) {
    this.definition = definition;
    this.endpoint = endpoint;
  }

  abstract readonly log: Logger;
  abstract start(): void;
  abstract stop(): Promise<void>;
  abstract sendToRemote(message: AgentTransmitResponse): void;

  async reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void> {
    const previousEndpoint = this.endpoint;
    this.definition = definition;
    this.endpoint = endpoint;

    this.log.info('Reloading config... Evaluating if channel needs to change address...');

    if (needToRebindToPort(previousEndpoint, endpoint)) {
      await this.stop();
      this.start();
      this.log.info(`Address changed: ${previousEndpoint.address} => ${endpoint.address}`);
    } else {
      this.log.info(`No address change needed. Listening at ${endpoint.address}`);
    }
  }

  getDefinition(): AgentChannel {
    return this.definition;
  }

  getEndpoint(): Endpoint {
    return this.endpoint;
  }
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
