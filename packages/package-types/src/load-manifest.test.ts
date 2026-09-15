// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadManifest } from './load-manifest';

const MANIFEST_BODY = `{
  schemaVersion: 1,
  package: 'demo',
  displayName: 'Demo',
  vendor: 'Acme',
  version: '1.0.0',
  majorVersion: 1,
  type: 'bot-integration',
  channel: 'stable',
  compatibility: { minMedplumVersion: '5.1.7' },
  artifacts: {
    consumer: { linkedBots: [{ identifier: 'demo-impl' }] },
    impl: {
      bots: [
        {
          identifier: 'demo-impl',
          file: 'dist/bots/demo-impl.js',
          runtime: {
            local: { runtimeVersion: 'vmcontext' },
            staging: { runtimeVersion: 'awslambda', timeout: 30 },
            production: { runtimeVersion: 'awslambda', timeout: 30 },
          },
        },
      ],
    },
  },
}`;

let packageDir: string;

beforeEach(() => {
  packageDir = mkdtempSync(join(tmpdir(), 'package-types-load-'));
});

afterEach(() => {
  rmSync(packageDir, { recursive: true, force: true });
});

function writeManifest(source: string): string {
  const path = join(packageDir, 'manifest.ts');
  writeFileSync(path, source, 'utf8');
  return path;
}

/**
 * Installs a stand-in `@medplum/package-types` into the package's own
 * `node_modules`, which is where a real authoring package's copy lives.
 */
function installPackageTypesStub(): void {
  const dir = join(packageDir, 'node_modules', '@medplum', 'package-types');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: '@medplum/package-types', version: '0.0.0', main: 'index.cjs' })
  );
  writeFileSync(join(dir, 'index.cjs'), 'exports.defineManifest = (m) => m;\nexports.STUB = true;\n', 'utf8');
}

describe('loadManifest', () => {
  it('compiles a type-only manifest module and returns its manifest export', async () => {
    const path = writeManifest(
      `import type { PackageManifest } from '@medplum/package-types';
export const manifest: PackageManifest = ${MANIFEST_BODY};
`
    );
    const manifest = await loadManifest(path);
    expect(manifest.package).toBe('demo');
    expect(manifest.majorVersion).toBe(1);
  });

  it('resolves a defineManifest value import from the package own node_modules', async () => {
    // The whole reason the compiled module is written next to the manifest: the
    // author gets the `@medplum/package-types` their package depends on, not
    // whichever copy happens to sit near the CLI.
    installPackageTypesStub();
    const path = writeManifest(
      `import { defineManifest } from '@medplum/package-types';
export const manifest = defineManifest(${MANIFEST_BODY});
`
    );
    const manifest = await loadManifest(path);
    expect(manifest.package).toBe('demo');
  });

  it('accepts a default export', async () => {
    const path = writeManifest(
      `import type { PackageManifest } from '@medplum/package-types';
const manifest: PackageManifest = ${MANIFEST_BODY};
export default manifest;
`
    );
    expect((await loadManifest(path)).package).toBe('demo');
  });

  it('throws when the module exports no manifest', async () => {
    const path = writeManifest(`export const notManifest = 1;\n`);
    await expect(loadManifest(path)).rejects.toThrow(/does not export `manifest`/);
  });

  it('leaves no compiled module behind in the package directory', async () => {
    const path = writeManifest(
      `import type { PackageManifest } from '@medplum/package-types';
export const manifest: PackageManifest = ${MANIFEST_BODY};
`
    );
    await loadManifest(path);
    expect(readdirSync(packageDir)).toEqual(['manifest.ts']);
  });

  it('cleans up even when the module throws on evaluation', async () => {
    const path = writeManifest(`throw new Error('boom');\n`);
    await expect(loadManifest(path)).rejects.toThrow(/boom/);
    expect(readdirSync(packageDir)).toEqual(['manifest.ts']);
  });
});
