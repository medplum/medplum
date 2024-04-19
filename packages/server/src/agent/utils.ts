export enum AgentConnectionState {
  UNKNOWN = 'unknown',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
}

export type AgentInfo = {
  status: AgentConnectionState;
  version: string;
  lastUpdated?: string;
};
