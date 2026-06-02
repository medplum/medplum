// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentTransmitResponse, ILogger } from '@medplum/core';
import type { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import type { App } from './app';

export interface ChannelStartResult {
  /** Resolves once the channel's listener has bound to its port, or rejects if binding failed. */
  startPromise: Promise<void>;
}

export interface Channel {
  readonly log: ILogger;
  readonly channelLog: ILogger;
  /**
   * Kicks off the channel. The returned promise resolves as soon as the listener bind has been
   * initiated; the `startPromise` it carries resolves once the listener has actually bound.
   * Binding is deferred so the zero-downtime upgrade flow can signal the previous agent to release
   * its ports before waiting on the binds. See {@link App.start}.
   */
  start(): Promise<ChannelStartResult>;
  stop(): Promise<void>;
  sendToRemote(message: AgentTransmitResponse): void;
  reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void>;
  getDefinition(): AgentChannel;
  getEndpoint(): Endpoint;
}

export abstract class BaseChannel implements Channel {
  readonly app: App;
  protected definition: AgentChannel;
  protected endpoint: Endpoint;

  constructor(app: App, definition: AgentChannel, endpoint: Endpoint) {
    this.app = app;
    this.definition = definition;
    this.endpoint = endpoint;
  }

  abstract readonly log: ILogger;
  abstract readonly channelLog: ILogger;
  abstract start(): Promise<ChannelStartResult>;
  abstract stop(): Promise<void>;
  abstract sendToRemote(message: AgentTransmitResponse): void;
  abstract reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void>;

  getDefinition(): AgentChannel {
    return this.definition;
  }

  getEndpoint(): Endpoint {
    return this.endpoint;
  }
}

export const ChannelType = {
  HL7_V2: 'HL7_V2',
  DICOM: 'DICOM',
  BYTE_STREAM: 'BYTE_STREAM',
} as const;
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export function getChannelType(endpoint: Endpoint): ChannelType {
  if (endpoint.address.startsWith('dicom')) {
    return ChannelType.DICOM;
  }
  if (endpoint.address.startsWith('mllp')) {
    return ChannelType.HL7_V2;
  }
  if (endpoint.address.startsWith('tcp')) {
    return ChannelType.BYTE_STREAM;
  }
  throw new Error(`Unsupported endpoint type: ${endpoint.address}`);
}

export function getChannelTypeShortName(endpoint: Endpoint): string {
  try {
    const channelType = getChannelType(endpoint);
    switch (channelType) {
      case ChannelType.HL7_V2:
        return 'HL7';
      case ChannelType.DICOM:
        return 'DICOM';
      case ChannelType.BYTE_STREAM:
        return 'Byte Stream';
      default:
        channelType satisfies never;
        throw new Error('Unreachable');
    }
  } catch (err) {
    throw new Error(`Invalid endpoint type with address '${endpoint.address}'`, { cause: err });
  }
}
