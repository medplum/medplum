// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Backend } from '../backends/backend';
import { Hl7EchoServer } from '../peers/hl7-echo-server';
import { Hl7SourceClient } from '../peers/hl7-source-client';
import { getTemplate } from '../templates';
import type {
  AgentNodeSpec,
  Command,
  Hl7SinkNodeSpec,
  Hl7SourceNodeSpec,
  ScenarioEvent,
  ScenarioSpec,
  TemplateContext,
  TimedCommand,
} from '../types';
import { Recorder } from './recorder';
import { Replayer } from './replayer';
import { getNode, validateScenario } from './topology';

export type ScenarioStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export class Scenario {
  readonly spec: ScenarioSpec;
  readonly backend: Backend;
  readonly recorder: Recorder;
  private status: ScenarioStatus = 'idle';
  private startedAt = 0;
  private sinks = new Map<string, Hl7EchoServer>();
  private sources = new Map<string, Hl7SourceClient>();
  private replayer?: Replayer;

  constructor(spec: ScenarioSpec, backend: Backend) {
    validateScenario(spec);
    this.spec = spec;
    this.backend = backend;
    this.recorder = new Recorder(spec);
  }

  getStatus(): ScenarioStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.status !== 'idle' && this.status !== 'stopped') {
      throw new Error(`scenario already in status '${this.status}'`);
    }
    this.status = 'starting';
    this.recorder.start();
    this.startedAt = Date.now();
    const emit = (e: ScenarioEvent): void => this.recorder.record(e);
    try {
      await this.backend.init(this.spec, emit);

      // Materialize + register all agents first so source peers can resolve targets.
      const templateCtx: TemplateContext = {
        scenario: this.spec,
        resourceId: (nodeId, subkey) => `harness-${nodeId}-${subkey}`,
      };
      for (const node of this.spec.nodes.filter((n): n is AgentNodeSpec => n.role === 'agent')) {
        const template = getTemplate(node.template);
        const mat = template.materialize(node, templateCtx);
        await this.backend.registerAgent(node.id, mat);
      }

      // Start sinks (so agents can connect outbound), then agents, then sources.
      for (const node of this.spec.nodes.filter((n): n is Hl7SinkNodeSpec => n.role === 'hl7-sink')) {
        const sink = new Hl7EchoServer(node);
        sink.setOnMessage((controlId) =>
          this.emit({ type: 'sink.message', nodeId: node.id, data: { controlId } })
        );
        const port = await sink.start();
        this.sinks.set(node.id, sink);
        this.emit({ type: 'sink.listening', nodeId: node.id, data: { port } });
      }
      for (const node of this.spec.nodes.filter((n): n is AgentNodeSpec => n.role === 'agent')) {
        await this.backend.startAgent(node.id);
      }
      for (const node of this.spec.nodes.filter((n): n is Hl7SourceNodeSpec => n.role === 'hl7-source')) {
        const source = new Hl7SourceClient(node);
        source.setOnEvent((kind, detail) =>
          this.emit({ type: `source.${kind}`, nodeId: node.id, data: detail })
        );
        const target = this.resolveSourceTarget(node);
        source.setTarget(target.host, target.port);
        await source.start();
        this.sources.set(node.id, source);
        this.emit({ type: 'source.connected', nodeId: node.id, data: target });
      }

      this.status = 'running';
      this.emit({ type: 'scenario.started' });

      if (this.spec.commands?.length) {
        this.replayer = new Replayer(this.spec.commands, (c) => this.issueCommand(c));
        this.replayer.start();
      }
    } catch (err) {
      this.status = 'error';
      this.emit({ type: 'scenario.error', data: { error: (err as Error).message } });
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.status !== 'running' && this.status !== 'error') {
      return;
    }
    this.status = 'stopping';
    this.replayer?.stop();
    for (const source of this.sources.values()) {
      await source.stop();
    }
    this.sources.clear();
    for (const node of this.spec.nodes.filter((n): n is AgentNodeSpec => n.role === 'agent')) {
      await this.backend.stopAgent(node.id);
    }
    for (const sink of this.sinks.values()) {
      await sink.stop();
    }
    this.sinks.clear();
    await this.backend.shutdown();
    this.status = 'stopped';
    this.emit({ type: 'scenario.stopped' });
  }

  /**
   * Issue a command against the running scenario. Source of truth for both API
   * calls and replayed timelines.
   */
  async issueCommand(command: Command): Promise<void> {
    this.emit({ type: 'command.issued', data: command });
    switch (command.type) {
      case 'set-mps': {
        const source = this.sources.get(command.nodeId);
        if (!source) throw new Error(`no hl7-source named '${command.nodeId}'`);
        source.setMps(command.mps);
        return;
      }
      case 'reload-config':
        await this.backend.reloadAgentConfig(command.nodeId);
        return;
      case 'upgrade-agent':
        await this.backend.upgradeAgent(command.nodeId, command.version);
        return;
      case 'update-channel':
        // v0: log only. Channel mutation lives in the backend reload path.
        this.emit({ type: 'channel.update.requested', nodeId: command.nodeId, data: command.patch });
        return;
      case 'stop-node':
        await this.stopNode(command.nodeId);
        return;
      case 'start-node':
        await this.startNode(command.nodeId);
        return;
      case 'inject': {
        const source = this.sources.get(command.nodeId);
        if (!source) throw new Error(`inject requires a source node; '${command.nodeId}' is not one`);
        // v0: rely on setMps + template message. Per-message injection is a follow-up.
        this.emit({ type: 'inject.ignored', nodeId: command.nodeId, data: { note: 'not implemented in v0' } });
        return;
      }
      case 'simulate-server-upgrade':
        await this.backend.simulateServerUpgrade({ downtimeMs: command.downtimeMs });
        return;
      case 'simulate-server-restart':
        await this.backend.simulateServerRestart({
          downtimeMs: command.downtimeMs,
          graceful: command.graceful,
        });
        return;
      default: {
        const _exhaustive: never = command;
        throw new Error(`unknown command: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  /**
   * Replay a previously recorded set of commands against this running scenario,
   * preserving the original relative timing.
   */
  replay(commands: TimedCommand[]): void {
    this.replayer?.stop();
    this.replayer = new Replayer(commands, (c) => this.issueCommand(c));
    this.replayer.start();
  }

  private async startNode(nodeId: string): Promise<void> {
    const node = getNode(this.spec, nodeId);
    if (node.role === 'agent') {
      await this.backend.startAgent(nodeId);
    } else if (node.role === 'hl7-sink' && !this.sinks.has(nodeId)) {
      const sink = new Hl7EchoServer(node);
      await sink.start();
      this.sinks.set(nodeId, sink);
    } else if (node.role === 'hl7-source' && !this.sources.has(nodeId)) {
      const source = new Hl7SourceClient(node);
      const target = this.resolveSourceTarget(node);
      source.setTarget(target.host, target.port);
      await source.start();
      this.sources.set(nodeId, source);
    }
  }

  private async stopNode(nodeId: string): Promise<void> {
    const node = getNode(this.spec, nodeId);
    if (node.role === 'agent') {
      await this.backend.stopAgent(nodeId);
    } else if (node.role === 'hl7-sink') {
      const sink = this.sinks.get(nodeId);
      await sink?.stop();
      this.sinks.delete(nodeId);
    } else if (node.role === 'hl7-source') {
      const source = this.sources.get(nodeId);
      await source?.stop();
      this.sources.delete(nodeId);
    }
  }

  private resolveSourceTarget(source: Hl7SourceNodeSpec): { host: string; port: number } {
    const target = getNode(this.spec, source.targetNodeId);
    if (target.role === 'hl7-sink') {
      const sink = this.sinks.get(target.id);
      const port = sink?.getBoundPort();
      if (!port) throw new Error(`sink '${target.id}' has no bound port yet`);
      return { host: '127.0.0.1', port };
    }
    if (target.role === 'agent') {
      return this.backend.resolveAgentChannelTarget(target.id, source.targetChannelName ?? 'hl7-in');
    }
    throw new Error(`hl7-source '${source.id}' targets unsupported role '${target.role}'`);
  }

  private emit(partial: Omit<ScenarioEvent, 'atMs'>): void {
    this.recorder.record({ atMs: Date.now() - this.startedAt, ...partial });
  }
}
