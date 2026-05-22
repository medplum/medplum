// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
    case 'source':
      if (!opts.monorepoRoot) {
        throw new Error("createLauncher: 'monorepoRoot' is required for 'source' launcher");
      }
      return new SourceAgentLauncher({ monorepoRoot: opts.monorepoRoot });
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
