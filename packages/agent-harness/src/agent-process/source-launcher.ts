// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AgentHandle, AgentLauncher, AgentRunState, AgentSpawnOptions } from './launcher';

export interface SourceLauncherOptions {
  /** Path to the medplum monorepo root containing packages/agent. Required. */
  monorepoRoot: string;
  /** Override the tsx executable (default: 'npx tsx'). */
  tsxCommand?: string;
  /** Forwarded stdio mode: 'inherit' to surface logs in the parent, 'pipe' to collect. */
  stdio?: 'inherit' | 'pipe';
}

/**
 * Runs @medplum/agent from monorepo source via tsx.
 *
 * No installer, no download. Best for fast local iteration on any host
 * platform (including macOS, where there's no released agent binary). Not
 * suitable for production scenarios — use BinaryAgentLauncher or
 * WindowsInstallerAgentLauncher for those.
 */
export class SourceAgentLauncher implements AgentLauncher {
  readonly kind = 'source' as const;
  private readonly opts: SourceLauncherOptions;
  private readonly agentMainPath: string;

  constructor(opts: SourceLauncherOptions) {
    this.opts = opts;
    this.agentMainPath = resolve(opts.monorepoRoot, 'packages', 'agent', 'src', 'main.ts');
    if (!existsSync(this.agentMainPath)) {
      throw new Error(`SourceAgentLauncher: agent source not found at ${this.agentMainPath}`);
    }
  }

  async prepare(_version?: string): Promise<void> {
    // No-op: source mode runs whatever is in the working tree.
  }

  async spawn(opts: AgentSpawnOptions): Promise<AgentHandle> {
    const stdio = this.opts.stdio ?? 'pipe';
    const args = [
      'tsx',
      this.agentMainPath,
      opts.baseUrl,
      opts.clientId,
      opts.clientSecret,
      opts.agentId,
      ...(opts.logLevel ? [opts.logLevel] : []),
    ];
    const child = spawn('npx', args, {
      cwd: this.opts.monorepoRoot,
      stdio,
      env: process.env,
    });
    return new SourceAgentHandle(opts.nodeId, child);
  }
}

class SourceAgentHandle implements AgentHandle {
  readonly kind = 'source' as const;
  readonly nodeId: string;
  readonly pid?: number;
  private state: AgentRunState = 'starting';
  private readonly child: ChildProcess;
  private exitPromise: Promise<void>;

  constructor(nodeId: string, child: ChildProcess) {
    this.nodeId = nodeId;
    this.child = child;
    this.pid = child.pid;
    this.exitPromise = new Promise((resolveFn) => {
      child.once('exit', (code) => {
        this.state = code === 0 ? 'stopped' : 'crashed';
        resolveFn();
      });
    });
    // Best-effort: assume running once the process has stayed up for a tick.
    setTimeout(() => {
      if (this.state === 'starting') this.state = 'running';
    }, 250).unref();
  }

  getState(): AgentRunState {
    return this.state;
  }

  async waitUntilRunning(timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.state === 'starting') {
      if (Date.now() > deadline) {
        throw new Error(`SourceAgentHandle[${this.nodeId}]: start timed out`);
      }
      await sleep(50);
    }
    if (this.state !== 'running') {
      throw new Error(`SourceAgentHandle[${this.nodeId}]: failed to start (state=${this.state})`);
    }
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'crashed') return;
    this.child.kill('SIGTERM');
    await Promise.race([this.exitPromise, unrefSleep(5_000)]);
    if (this.state === 'starting' || this.state === 'running') {
      this.child.kill('SIGKILL');
      await this.exitPromise;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function unrefSleep(ms: number): Promise<void> {
  return new Promise((r) => {
    setTimeout(r, ms).unref();
  });
}
