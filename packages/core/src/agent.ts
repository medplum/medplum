export interface BaseAgentMessage {
  type: string;
}

export interface BaseAgentRequestMessage extends BaseAgentMessage {
  accessToken: string;
  callback?: string;
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

export interface AgentTransmitRequest extends BaseAgentRequestMessage {
  type: 'agent:transmit:request';
  channel: string;
  remote?: string;
  body: string;
}

export interface AgentTransmitResponse extends BaseAgentMessage {
  type: 'agent:transmit:response';
  channel: string;
  body: string;
}

export type AgentMessage =
  | AgentError
  | AgentConnectRequest
  | AgentConnectResponse
  | AgentTransmitRequest
  | AgentTransmitResponse;
