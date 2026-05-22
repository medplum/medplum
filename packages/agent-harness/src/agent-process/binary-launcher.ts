// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { chmodSync } from 'node:fs';
import type { AgentHandle, AgentLauncher, AgentRunState, AgentSpawnOptions } from './launcher';
import { ReleaseCache } from './release-cache';

export interface BinaryLauncherOptions {
  /** Override the release cache directory. */
  cacheDir?: string;
  /** Forwarded stdio mode. */
  stdio?: 'inherit' | 'pipe';
}

/**
 * Launches the Medplum Agent from a downloaded Linux binary.
 *
 * Downloads `medplum-agent-{version}-linux` from the release manifest at
 * meta.medplum.com, marks it executable, and spawns it with the agent's
 * standard CLI args. macOS is not supported because no darwin asset is
 * published — use SourceAgentLauncher for macOS dev.
 */
export class BinaryAgentLauncher implements AgentLauncher {
  readonly kind = 'binary' as const;
  private readonly cache: ReleaseCache;
  private readonly opts: BinaryLauncherOptions;
  private cachedPath?: string;
  private cachedVersion?: string;

  constructor(opts: BinaryLauncherOptions = {}) {
    this.opts = opts;
    this.cache = new ReleaseCache(opts.cacheDir);
  }

  async prepare(version?: string): Promise<void> {
    const asset = await this.cache.ensure(version, 'linux');
    chmodSync(asset.path, 0o755);
    this.cachedPath = asset.path;
    this.cachedVersion = asset.version;
  }

  async spawn(opts: AgentSpawnOptions): Promise<AgentHandle> {
    if (!this.cachedPath || (opts.version && opts.version !== this.cachedVersion)) {
      await this.prepare(opts.version);
    }
    const args = [
      opts.baseUrl,
      opts.clientId,
      opts.clientSecret,
      opts.agentId,
      ...(opts.logLevel ? [opts.logLevel] : []),
    ];
    const child = spawn(this.cachedPath as string, args, {
      stdio: this.opts.stdio ?? 'pipe',
      env: process.env,
    });
    return new BinaryAgentHandle(opts.nodeId, child);
  }
}

class BinaryAgentHandle implements AgentHandle {
  readonly kind = 'binary' as const;
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
    setTimeout(() => {
      if (this.state === 'starting') this.state = 'running';
    }, 500).unref();
  }

  getState(): AgentRunState {
    return this.state;
  }

  async waitUntilRunning(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.state === 'starting') {
      if (Date.now() > deadline) {
        throw new Error(`BinaryAgentHandle[${this.nodeId}]: start timed out`);
      }
      await sleep(100);
    }
    if (this.state !== 'running') {
      throw new Error(`BinaryAgentHandle[${this.nodeId}]: failed to start (state=${this.state})`);
    }
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'crashed') return;
    this.child.kill('SIGTERM');
    await Promise.race([
      this.exitPromise,
      new Promise<void>((r) => setTimeout(r, 5_000).unref()),
    ]);
    if (this.state === 'starting' || this.state === 'running') {
      this.child.kill('SIGKILL');
      await this.exitPromise;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
