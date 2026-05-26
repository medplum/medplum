// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AgentLauncher, LauncherKind, SelectLauncherOptions } from './launcher';
import { pickLauncherKind } from './launcher';
import { BinaryAgentLauncher } from './binary-launcher';
import { SourceAgentLauncher } from './source-launcher';
import { WindowsInstallerAgentLauncher } from './windows-installer-launcher';

export type { AgentHandle, AgentLauncher, AgentRunState, AgentSpawnOptions, LauncherKind, SelectLauncherOptions } from './launcher';
export { pickLauncherKind };
export { ReleaseCache } from './release-cache';
export { SourceAgentLauncher } from './source-launcher';
export { BinaryAgentLauncher } from './binary-launcher';
export { WindowsInstallerAgentLauncher } from './windows-installer-launcher';

/**
 * Convenience factory. For full control (extra constructor options like the
 * Windows `mode` or stdio settings) instantiate the concrete launcher class
 * directly.
 */
export function createLauncher(opts: SelectLauncherOptions = {}): AgentLauncher {
  const kind: LauncherKind = pickLauncherKind(opts);
  switch (kind) {
    case 'source': {
      const monorepoRoot = opts.monorepoRoot ?? process.env.MEDPLUM_MONOREPO_ROOT ?? findMonorepoRoot();
      if (!monorepoRoot) {
        throw new Error(
          "createLauncher: 'monorepoRoot' is required for 'source' launcher. " +
            'Set it via SelectLauncherOptions, MEDPLUM_MONOREPO_ROOT env var, or run the harness from inside the medplum monorepo.'
        );
      }
      return new SourceAgentLauncher({ monorepoRoot });
    }
    case 'binary':
      return new BinaryAgentLauncher({ cacheDir: opts.cacheDir });
    case 'windows-installer':
      return new WindowsInstallerAgentLauncher({ cacheDir: opts.cacheDir, mode: opts.windowsMode });
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unsupported launcher kind: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Walks up from this file's location looking for `packages/agent/src/main.ts`.
 * Lets the harness auto-pick the right `monorepoRoot` when running from inside
 * the medplum checkout (the common dev case). Returns undefined when not found.
 */
export function findMonorepoRoot(startDir: string = __dirname): string | undefined {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, 'packages', 'agent', 'src', 'main.ts'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
