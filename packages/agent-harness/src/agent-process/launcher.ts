// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { platform } from 'node:os';

/**
 * Identifies how the agent process is launched. On Linux we run a downloaded
 * binary; on Windows we go through the NSIS installer (required for prod-like
 * behavior — the installer registers the Windows service that hosts the
 * agent); on any host with the monorepo checkout we can run the agent from
 * source via tsx for fast iteration.
 */
export type LauncherKind = 'source' | 'binary' | 'windows-installer';

export interface AgentSpawnOptions {
  /** Unique within the harness; used for logs + bookkeeping. */
  nodeId: string;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  agentId: string;
  /** Defaults to 'INFO'. */
  logLevel?: string;
  /** Optional version pin; if omitted, launcher picks (source = current monorepo, binary/windows = latest). */
  version?: string;
}

export type AgentRunState = 'starting' | 'running' | 'stopped' | 'crashed';

export interface AgentHandle {
  readonly kind: LauncherKind;
  readonly nodeId: string;
  /** Defined for binary/source; undefined for Windows service-managed processes. */
  readonly pid?: number;
  getState(): AgentRunState;
  /** Resolves when the agent has finished starting (process up, or service reports running). */
  waitUntilRunning(timeoutMs?: number): Promise<void>;
  /** Stop the agent. Idempotent. */
  stop(): Promise<void>;
  /** Trigger an in-place config reload (where supported). */
  reload?(): Promise<void>;
}

export interface AgentLauncher {
  readonly kind: LauncherKind;
  /**
   * Make the agent binary/installer available locally. No-op for source mode.
   * Safe to call multiple times — implementations cache.
   */
  prepare(version?: string): Promise<void>;
  /** Start an agent process. */
  spawn(opts: AgentSpawnOptions): Promise<AgentHandle>;
}

export interface SelectLauncherOptions {
  /** Force a specific launcher kind. Useful in tests + heterogeneous deploys. */
  kind?: LauncherKind;
  /** Required for source launcher: path to the medplum monorepo root. Defaults to env or cwd discovery. */
  monorepoRoot?: string;
  /** Optional release cache dir for binary + windows-installer launchers. */
  cacheDir?: string;
  /**
   * Windows-only: 'service' (default, prod-like) or 'unpacked-exe' (faster,
   * suitable for containers without SCM).
   */
  windowsMode?: 'service' | 'unpacked-exe';
}

/**
 * Pick the right launcher for the current host.
 *
 * Resolution rules:
 *   - opts.kind wins if set
 *   - platform() === 'win32' -> windows-installer
 *   - opts.monorepoRoot set -> source
 *   - platform() === 'linux' -> binary
 *   - otherwise -> source (best-effort dev fallback)
 *
 * Note: this function only returns a launcher *factory* indication; the
 * caller still has to construct the right impl (the launcher classes are
 * exported individually so callers can pass extra options).
 */
export function pickLauncherKind(opts?: SelectLauncherOptions): LauncherKind {
  if (opts?.kind) return opts.kind;
  const host = platform();
  if (host === 'win32') return 'windows-installer';
  if (opts?.monorepoRoot) return 'source';
  if (host === 'linux') return 'binary';
  return 'source';
}
