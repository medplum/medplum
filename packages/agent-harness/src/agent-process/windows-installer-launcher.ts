// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { exec as execCb, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { AgentHandle, AgentLauncher, AgentRunState, AgentSpawnOptions } from './launcher';
import { ReleaseCache } from './release-cache';

const exec = promisify(execCb);

export interface WindowsInstallerLauncherOptions {
  /**
   * 'service' (default, prod-like): manage the Windows service installed by
   * the NSIS installer via `sc.exe`.
   * 'unpacked-exe': spawn the agent .exe directly from $INSTDIR. Better fit
   * for Windows containers without a service manager (e.g. nanoserver-class
   * images) — but skip the service registration step in install.
   */
  mode?: 'service' | 'unpacked-exe';
  /** Install directory; defaults to `C:\Program Files\Medplum Agent`. */
  installDir?: string;
  /** Where to cache the installer .exe. */
  cacheDir?: string;
  /**
   * If true, skip running the installer — assume the agent is already
   * installed (e.g. the container image was built with the agent baked in).
   * The launcher only manages start/stop of the existing install.
   */
  assumePreInstalled?: boolean;
}

/**
 * Launches the Medplum Agent on Windows via the NSIS installer.
 *
 * Flow (when `assumePreInstalled = false`):
 *   1. Download the installer (`medplum-agent-installer-{version}.exe`) from
 *      the release manifest to the cache directory.
 *   2. Pre-write `agent.properties` to the install dir — when present, the
 *      installer skips its interactive InputPage and uses the file.
 *   3. Run the installer with `/S` (NSIS silent mode). The installer:
 *        - copies the agent .exe to `$INSTDIR`
 *        - registers a Windows service named
 *          `MedplumAgent_<version>-<gitsha>` and starts it
 *   4. After install, in `service` mode we don't need to do anything; the
 *      service is already running. In `unpacked-exe` mode we stop the service
 *      and spawn the unpacked .exe directly so the harness owns the process.
 *
 * Caveats:
 *   - The current NSIS installer (packages/agent/installer.nsi) doesn't parse
 *     command-line args for baseUrl/clientId/etc. — the pre-written
 *     `agent.properties` is the supported headless entry point.
 *   - For Windows nanoserver containers (no SCM), use `mode: 'unpacked-exe'`
 *     and consider `assumePreInstalled: true` with a pre-baked image.
 */
export class WindowsInstallerAgentLauncher implements AgentLauncher {
  readonly kind = 'windows-installer' as const;
  private readonly cache: ReleaseCache;
  private readonly opts: Required<Pick<WindowsInstallerLauncherOptions, 'mode' | 'installDir'>> &
    WindowsInstallerLauncherOptions;
  private installedVersion?: string;

  constructor(opts: WindowsInstallerLauncherOptions = {}) {
    this.opts = {
      mode: opts.mode ?? 'service',
      installDir: opts.installDir ?? 'C:\\Program Files\\Medplum Agent',
      ...opts,
    };
    this.cache = new ReleaseCache(opts.cacheDir);
  }

  async prepare(version?: string): Promise<void> {
    if (this.opts.assumePreInstalled) {
      this.installedVersion = version;
      return;
    }
    const asset = await this.cache.ensure(version, 'win32');
    this.installedVersion = asset.version;
    // The installer can't run yet — agent.properties is written per-spawn
    // (it carries client credentials that vary per agent). Defer to spawn().
  }

  async spawn(opts: AgentSpawnOptions): Promise<AgentHandle> {
    if (!this.installedVersion) {
      await this.prepare(opts.version);
    }
    const version = this.installedVersion as string;

    if (!this.opts.assumePreInstalled) {
      await this.runSilentInstall(version, opts);
    }

    if (this.opts.mode === 'service') {
      const serviceName = await this.findServiceName(version);
      await this.ensureServiceRunning(serviceName);
      return new ServiceAgentHandle(opts.nodeId, serviceName);
    }

    return this.spawnUnpackedExe(opts, version);
  }

  /**
   * Write agent.properties + run the NSIS installer in silent mode.
   *
   * Property file at $INSTDIR\agent.properties tells the installer to skip
   * the interactive InputPage. Requires the harness to have admin rights to
   * write under Program Files (true in standard Windows containers).
   */
  private async runSilentInstall(version: string, opts: AgentSpawnOptions): Promise<void> {
    if (!existsSync(this.opts.installDir)) {
      mkdirSync(this.opts.installDir, { recursive: true });
    }
    const propsPath = resolve(this.opts.installDir, 'agent.properties');
    writeFileSync(
      propsPath,
      [
        `baseUrl=${opts.baseUrl}`,
        `clientId=${opts.clientId}`,
        `clientSecret=${opts.clientSecret}`,
        `agentId=${opts.agentId}`,
        ...(opts.logLevel ? [`logLevel=${opts.logLevel}`] : []),
        '',
      ].join('\r\n')
    );
    const asset = await this.cache.ensure(version, 'win32');
    await exec(`"${asset.path}" /S`, { windowsHide: true });
  }

  /**
   * Locate the installed service. The NSIS installer registers a service
   * named `MedplumAgent_<version>-<gitsha>`. We can find it by querying the
   * registry uninstall key, or by listing services that start with
   * `MedplumAgent_`. We use the latter — simpler + doesn't require the exact
   * git short-hash.
   */
  private async findServiceName(_version: string): Promise<string> {
    const { stdout } = await exec('sc.exe query state= all', { windowsHide: true });
    const match = stdout.match(/SERVICE_NAME:\s*(MedplumAgent_[^\s]+)/);
    if (!match) {
      throw new Error('No installed Medplum Agent service found via sc.exe query');
    }
    return match[1];
  }

  private async ensureServiceRunning(serviceName: string): Promise<void> {
    // sc start is idempotent in spirit — we tolerate the "already started" error.
    try {
      await exec(`sc.exe start "${serviceName}"`, { windowsHide: true });
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      if (!/already running|1056/i.test(msg)) {
        throw err;
      }
    }
  }

  private async spawnUnpackedExe(opts: AgentSpawnOptions, _version: string): Promise<AgentHandle> {
    // The installer copies the agent .exe with a versioned name; glob it.
    const { stdout } = await exec(
      `powershell.exe -NoProfile -Command "(Get-ChildItem -Path '${this.opts.installDir}' -Filter 'medplum-agent-*-win64.exe' | Select-Object -First 1).FullName"`,
      { windowsHide: true }
    );
    const exePath = stdout.trim();
    if (!exePath || !existsSync(exePath)) {
      throw new Error(`Could not locate unpacked agent exe under ${this.opts.installDir}`);
    }
    const args = [
      opts.baseUrl,
      opts.clientId,
      opts.clientSecret,
      opts.agentId,
      ...(opts.logLevel ? [opts.logLevel] : []),
    ];
    const child = spawn(exePath, args, { windowsHide: true, stdio: 'pipe' });
    return new UnpackedExeAgentHandle(opts.nodeId, child.pid, () => child.kill('SIGTERM'));
  }
}

class ServiceAgentHandle implements AgentHandle {
  readonly kind = 'windows-installer' as const;
  readonly nodeId: string;
  readonly pid?: undefined; // services are managed by SCM, no direct PID
  private state: AgentRunState = 'running';
  private readonly serviceName: string;

  constructor(nodeId: string, serviceName: string) {
    this.nodeId = nodeId;
    this.serviceName = serviceName;
  }

  getState(): AgentRunState {
    return this.state;
  }

  async waitUntilRunning(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { stdout } = await exec(`sc.exe query "${this.serviceName}"`, { windowsHide: true });
      if (/STATE\s*:\s*4\s*RUNNING/.test(stdout)) {
        this.state = 'running';
        return;
      }
      await sleep(500);
    }
    throw new Error(`Service ${this.serviceName} did not reach RUNNING state in ${timeoutMs}ms`);
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped') return;
    try {
      await exec(`sc.exe stop "${this.serviceName}"`, { windowsHide: true });
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      if (!/not started|1062/i.test(msg)) {
        throw err;
      }
    }
    this.state = 'stopped';
  }

  /** Service-mode reload = restart the service. */
  async reload(): Promise<void> {
    await this.stop();
    await exec(`sc.exe start "${this.serviceName}"`, { windowsHide: true });
    this.state = 'running';
  }
}

class UnpackedExeAgentHandle implements AgentHandle {
  readonly kind = 'windows-installer' as const;
  readonly nodeId: string;
  readonly pid?: number;
  private state: AgentRunState = 'running';
  private readonly killer: () => void;

  constructor(nodeId: string, pid: number | undefined, killer: () => void) {
    this.nodeId = nodeId;
    this.pid = pid;
    this.killer = killer;
  }

  getState(): AgentRunState {
    return this.state;
  }

  async waitUntilRunning(_timeoutMs?: number): Promise<void> {
    // No service to poll; assume running once the process has been spawned.
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped') return;
    this.killer();
    this.state = 'stopped';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
