// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Agent, Bot, Endpoint } from '@medplum/fhirtypes';
import type { EnhancedMode } from '@medplum/hl7';

export type NodeRole = 'agent' | 'hl7-source' | 'hl7-sink';

export interface BaseNodeSpec {
  /** Unique within the scenario. */
  id: string;
  role: NodeRole;
  /** Human label, defaults to id. */
  label?: string;
}

export interface AgentNodeSpec extends BaseNodeSpec {
  role: 'agent';
  /** Name of a registered template (e.g. 'push-bot'). */
  template: string;
  /** Template-specific inputs. The template validates these. */
  inputs: Record<string, unknown>;
}

export interface Hl7SourceNodeSpec extends BaseNodeSpec {
  role: 'hl7-source';
  /** id of the node this source connects to (must be an agent with an HL7 channel, or an hl7-sink). */
  targetNodeId: string;
  /** Optional channel name when targeting an agent with multiple HL7 channels. */
  targetChannelName?: string;
  /** Messages per second. 0 means "no load until /commands flips it on". */
  mps: number;
  /** Sample message used when generating load. Defaults to a minimal ADT^A01. */
  templateMessage?: string;
  enhancedMode?: EnhancedMode;
  keepAlive?: boolean;
}

export interface Hl7SinkNodeSpec extends BaseNodeSpec {
  role: 'hl7-sink';
  /** TCP port to bind. 0 = ephemeral. */
  port: number;
  enhancedMode?: EnhancedMode;
  /** AA (success) | AE (app error) | AR (reject). Default AA. */
  ackCode?: 'AA' | 'AE' | 'AR';
  /** Optional artificial latency before ACK. */
  ackDelayMs?: number;
}

export type NodeSpec = AgentNodeSpec | Hl7SourceNodeSpec | Hl7SinkNodeSpec;

export interface ScenarioSpec {
  name: string;
  /** Defaults to `simulated` for v0. */
  backend?: 'simulated' | 'hybrid' | 'real';
  nodes: NodeSpec[];
  /** Initial timeline of commands to play at scenario start. */
  commands?: TimedCommand[];
}

/**
 * Materialized resources produced by an agent template.
 *
 * `agent` contains the channel wiring; `endpoints` are the TCP listeners; `bot`
 * is the optional Push Bot that fires Agent/$push when a message arrives;
 * `forwardingRules` are server-side routing rules the harness's fake server
 * uses to stand in for Bot execution (see `FakeMedplumServer`).
 */
export interface AgentMaterialization {
  agent: Agent;
  endpoints: Endpoint[];
  bot?: Bot;
  forwardingRules?: ForwardingRule[];
}

/**
 * Tells the fake server "when agent `fromAgentId` receives a transmit on
 * channel `fromChannel`, push it to agent `toAgentId` on channel `toChannel`
 * and use that downstream ACK as the upstream response." Modeled after what
 * a Bot calling `Agent/$push` does on a real medplum/server, but without
 * needing to run Bot code in-process.
 *
 * The fake server ignores rules whose `fromAgentId` doesn't match the agent
 * that sent the inbound request — and falls back to a synthesized AA ACK if
 * no rule matches.
 */
export interface ForwardingRule {
  fromAgentId: string;
  fromChannel: string;
  toAgentId: string;
  toChannel: string;
  /**
   * Where the downstream agent should send the message on its outbound side
   * (mllp://host:port). If omitted, the fake server resolves it from the
   * downstream agent's channel/Endpoint at forward time.
   */
  toRemote?: string;
}

export interface AgentTemplate {
  name: string;
  /** Human-readable description for the registry listing. */
  description: string;
  /**
   * Produces the FHIR resources for the node and any harness-side metadata
   * (e.g. listen port the source peer should target).
   */
  materialize(node: AgentNodeSpec, ctx: TemplateContext): AgentMaterialization;
}

export interface TemplateContext {
  /** All other nodes in the scenario, for cross-referencing (e.g. forwardTo target). */
  scenario: ScenarioSpec;
  /** Issues a stable resource ID for a given (nodeId, subkey) pair. */
  resourceId(nodeId: string, subkey: string): string;
}

/**
 * A command targeted at the running scenario. These can come from the initial
 * spec, the HTTP API at runtime, or a replayed recording.
 */
export type Command =
  | { type: 'set-mps'; nodeId: string; mps: number }
  | { type: 'reload-config'; nodeId: string }
  | { type: 'upgrade-agent'; nodeId: string; version: string }
  | { type: 'update-channel'; nodeId: string; channelName: string; patch: Record<string, unknown> }
  | { type: 'stop-node'; nodeId: string }
  | { type: 'start-node'; nodeId: string }
  | { type: 'inject'; nodeId: string; message: string }
  /**
   * Simulates a Medplum server upgrade by dropping all agent WS connections for
   * `downtimeMs`, then accepting them again. Tests agent reconnect + buffering
   * behavior under realistic conditions.
   */
  | { type: 'simulate-server-upgrade'; downtimeMs: number }
  /**
   * Simulates a Medplum server restart. Distinct from `simulate-server-upgrade`
   * in that it's abrupt by default — sockets are torn down with TCP RST (no
   * close frame), modeling a crash, OOM kill, or `kill -9`. The agent has no
   * warning and must rely on its own reconnect/backoff loop.
   *
   * Set `graceful: true` to send a 1012 close frame first (same as
   * `simulate-server-upgrade` but with the restart semantic).
   */
  | { type: 'simulate-server-restart'; downtimeMs: number; graceful?: boolean };

export interface TimedCommand {
  /** Milliseconds after scenario start. */
  atMs: number;
  command: Command;
}

export interface ScenarioEvent {
  /** Milliseconds since scenario start. */
  atMs: number;
  /** Event kind: command issued, message sent/received, ACK, error, etc. */
  type: string;
  nodeId?: string;
  data?: unknown;
}

export interface RecordedScenario {
  spec: ScenarioSpec;
  /** Wall-clock start of the recording. */
  startedAt: string;
  /** All events captured during the run. */
  events: ScenarioEvent[];
}
