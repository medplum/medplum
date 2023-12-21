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

export interface AgentPingRequest extends BaseAgentRequestMessage {
  type: 'agent:ping:request';
}

export interface AgentPingResponse extends BaseAgentMessage {
  type: 'agent:ping:response';
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
  body: string;
}

export type AgentMessage =
  | AgentError
  | AgentConnectRequest
  | AgentConnectResponse
  | AgentPingRequest
  | AgentPingResponse
  | AgentTransmitRequest
  | AgentTransmitResponse;
