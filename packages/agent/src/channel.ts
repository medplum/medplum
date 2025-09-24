// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AgentTransmitResponse, ILogger } from '@medplum/core';
import { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import { App } from './app';

export interface Channel {
  readonly log: ILogger;
  readonly channelLog: ILogger;
  start(): void;
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
  abstract start(): void;
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
  BYTE_STREAM: 'byte_stream',
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
  switch (getChannelType(endpoint)) {
    case ChannelType.HL7_V2:
      return 'HL7';
    case ChannelType.DICOM:
      return 'DICOM';
    case ChannelType.BYTE_STREAM:
      return 'Byte Stream';
    default:
      throw new Error(`Invalid endpoint type with address '${endpoint.address}'`);
  }
}
