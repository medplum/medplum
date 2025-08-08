// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export const AgentConnectionState = {
  UNKNOWN: 'unknown',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
} as const;
export type AgentConnectionState = (typeof AgentConnectionState)[keyof typeof AgentConnectionState];

export type AgentInfo = {
  status: AgentConnectionState;
  version: string;
  lastUpdated?: string;
};
