// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentMaterialization, ScenarioEvent, ScenarioSpec } from '../../types';
import type { Backend } from '../backend';

/**
 * RealBackend — talks to a running medplum/server.
 *
 * v0 is a stub. The intended shape:
 *   - On `init`, authenticate a MedplumClient against `baseUrl` using a client
 *     credentials grant from RealBackendOptions.
 *   - `registerAgent` upserts the Endpoint, Bot, Agent resources via FHIR.
 *   - `startAgent` spawns @medplum/agent as a child process (or signals an
 *     existing one) with config pointing to the registered Agent.
 *   - `simulateServerUpgrade` is hardest here: we can't actually bounce the
 *     real server from inside the test. Options: (a) talk to an admin endpoint
 *     that drains agent WS connections; (b) restart the server via docker
 *     compose; (c) document this as unsupported on real backend.
 *
 * For now, every method throws so attempting to run a scenario against a real
 * backend is loud rather than silently broken.
 */
export interface RealBackendOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

export class RealBackend implements Backend {
  readonly kind = 'real' as const;
  readonly options: RealBackendOptions;

  constructor(options: RealBackendOptions) {
    this.options = options;
  }

  async init(_scenario: ScenarioSpec, _emit: (e: ScenarioEvent) => void): Promise<void> {
    throw new Error('RealBackend is not yet implemented; use SimulatedBackend for v0');
  }
  async shutdown(): Promise<void> {
    throw new Error('not implemented');
  }
  async registerAgent(_nodeId: string, _materialization: AgentMaterialization): Promise<void> {
    throw new Error('not implemented');
  }
  async startAgent(_nodeId: string): Promise<void> {
    throw new Error('not implemented');
  }
  async stopAgent(_nodeId: string): Promise<void> {
    throw new Error('not implemented');
  }
  async reloadAgentConfig(_nodeId: string): Promise<void> {
    throw new Error('not implemented');
  }
  async upgradeAgent(_nodeId: string, _version: string): Promise<void> {
    throw new Error('not implemented');
  }
  async simulateServerUpgrade(_opts: { downtimeMs: number }): Promise<void> {
    throw new Error('not implemented');
  }
  resolveAgentChannelTarget(_nodeId: string, _channelName: string): { host: string; port: number } {
    throw new Error('not implemented');
  }
}
