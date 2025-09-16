// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LogMessage } from './logger';

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
  force?: boolean;
}

export interface AgentUpgradeResponse extends BaseAgentMessage {
  type: 'agent:upgrade:response';
  statusCode: number;
}

export interface AgentLogsRequest extends BaseAgentRequestMessage {
  type: 'agent:logs:request';
  limit?: number;
}

export interface AgentLogsResponse extends BaseAgentMessage {
  type: 'agent:logs:response';
  statusCode: number;
  logs: LogMessage[];
}

export type AgentRequestMessage =
  | AgentConnectRequest
  | AgentHeartbeatRequest
  | AgentTransmitRequest
  | AgentReloadConfigRequest
  | AgentUpgradeRequest
  | AgentLogsRequest;

export type AgentResponseMessage =
  | AgentConnectResponse
  | AgentHeartbeatResponse
  | AgentTransmitResponse
  | AgentReloadConfigResponse
  | AgentUpgradeResponse
  | AgentLogsResponse
  | AgentError;

export type AgentMessage = AgentRequestMessage | AgentResponseMessage;
