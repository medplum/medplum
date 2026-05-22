// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { platform } from 'node:os';
import { resolve } from 'node:path';
import { createLauncher, pickLauncherKind } from './index';

const MONOREPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

describe('pickLauncherKind', () => {
  it('honors explicit kind', () => {
    expect(pickLauncherKind({ kind: 'source', monorepoRoot: MONOREPO_ROOT })).toBe('source');
    expect(pickLauncherKind({ kind: 'binary' })).toBe('binary');
    expect(pickLauncherKind({ kind: 'windows-installer' })).toBe('windows-installer');
  });

  it('picks windows-installer on win32', () => {
    if (platform() !== 'win32') return; // host-conditional
    expect(pickLauncherKind()).toBe('windows-installer');
  });

  it('prefers source when monorepoRoot is set', () => {
    if (platform() === 'win32') return;
    expect(pickLauncherKind({ monorepoRoot: MONOREPO_ROOT })).toBe('source');
  });

  it('falls back to binary on linux without monorepoRoot', () => {
    if (platform() !== 'linux') return;
    expect(pickLauncherKind()).toBe('binary');
  });
});

describe('createLauncher (source) — spawn smoke', () => {
  it('spawns the agent from source and rejects bogus credentials', async () => {
    const launcher = createLauncher({ kind: 'source', monorepoRoot: MONOREPO_ROOT });
    expect(launcher.kind).toBe('source');
    await launcher.prepare();
    const handle = await launcher.spawn({
      nodeId: 'test-agent',
      baseUrl: 'http://127.0.0.1:1', // unreachable on purpose
      clientId: 'not-a-real-id',
      clientSecret: 'not-a-real-secret',
      agentId: 'agent-1',
    });
    expect(handle.kind).toBe('source');
    expect(handle.pid).toBeGreaterThan(0);
    // Let it run briefly — it'll fail to authenticate against 127.0.0.1:1 but
    // proves the launcher invocation works end-to-end.
    await new Promise((r) => setTimeout(r, 400));
    await handle.stop();
    expect(['stopped', 'crashed']).toContain(handle.getState());
  }, 15_000);
});
