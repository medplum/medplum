// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentMaterialization, ScenarioEvent, ScenarioSpec } from '../types';

export type BackendKind = 'simulated' | 'real';

/**
 * A backend owns the runtime that agents connect to (Medplum server WS), and
 * the lifecycle of agent processes themselves. The two v0 implementations are
 * `SimulatedBackend` (in-process fake server, no real medplum/server needed)
 * and `RealBackend` (talks to a running medplum/server via MedplumClient).
 *
 * Why an interface? So scenarios can be authored once and replayed against
 * either substrate, and so the harness can degrade gracefully when no server
 * is available.
 */
export interface Backend {
  readonly kind: BackendKind;

  /** Called once when the scenario starts; backend can boot its server. */
  init(scenario: ScenarioSpec, emit: (e: ScenarioEvent) => void): Promise<void>;

  /** Tear everything down (server, agents, sockets). */
  shutdown(): Promise<void>;

  /**
   * Persist the FHIR resources produced by an agent template into the backend.
   * `SimulatedBackend` stores them in memory; `RealBackend` upserts via FHIR.
   */
  registerAgent(nodeId: string, materialization: AgentMaterialization): Promise<void>;

  /**
   * Start an agent process wired to this backend. Returns when the agent has
   * established its WS connection.
   */
  startAgent(nodeId: string): Promise<void>;

  /** Stop an agent process. */
  stopAgent(nodeId: string): Promise<void>;

  /** Trigger an in-place config reload on the running agent. */
  reloadAgentConfig(nodeId: string): Promise<void>;

  /** Trigger an agent self-upgrade to the given version. */
  upgradeAgent(nodeId: string, version: string): Promise<void>;

  /**
   * Simulate a Medplum server upgrade: drop all agent WS connections for
   * `downtimeMs` and then accept them again. Used to test reconnect + buffering
   * behavior under realistic conditions.
   *
   * Resolves once the server is accepting connections again. Reconnect of
   * individual agents is observable via emitted ScenarioEvents.
   */
  simulateServerUpgrade(opts: { downtimeMs: number }): Promise<void>;

  /**
   * Return the agent-facing host/port a downstream HL7 source should target
   * when sending into a particular agent channel.
   */
  resolveAgentChannelTarget(nodeId: string, channelName: string): { host: string; port: number };
}
