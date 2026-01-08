// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TypedEventTarget } from '@medplum/core';

export interface AgentArgs {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  agentId: string;
  logLevel?: string;
  [key: string]: string | undefined;
}

export type HeartbeatEmitter = TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>;
