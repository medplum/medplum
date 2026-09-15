// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import type { PackageManifest } from './types';

/**
 * Loads a `manifest.ts` module and returns its `manifest` export.
 *
 * The module is compiled with esbuild rather than imported directly, so this
 * works the same whether the caller is running from source or from a bundled
 * CLI. The compiled module is written **next to the manifest** rather than into
 * a temp directory: a manifest may value-import `@medplum/package-types` (for
 * `defineManifest`), and resolving that from the package's own tree is what
 * guarantees it gets the version the package actually depends on. The same
 * placement is what lets `typescript` and `esbuild` stay external instead of
 * being inlined into a throwaway bundle.
 *
 * Callers should run {@link validateManifestSource} first. This executes the
 * module in the current process, and the AST rules exist to forbid exactly what
 * executing an unvetted module would run.
 * @param manifestPath - Path to the package's `manifest.ts`.
 * @returns The `manifest` export from the module.
 */
export async function loadManifest(manifestPath: string): Promise<PackageManifest> {
  const abs = resolve(manifestPath);
  const result = await build({
    entryPoints: [abs],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    external: ['typescript', 'esbuild'],
  });

  const code = result.outputFiles?.[0]?.text;
  if (!code) {
    throw new Error(`Failed to compile manifest at ${abs}`);
  }

  const compiled = join(dirname(abs), `.medplum-manifest-${randomUUID()}.cjs`);
  try {
    writeFileSync(compiled, code, 'utf8');
    // Base the require on the compiled file's own absolute path, so this works
    // under both the ESM and CJS builds of this package.
    const require = createRequire(compiled);
    const mod = require(compiled) as { manifest?: PackageManifest; default?: PackageManifest };
    const manifest = mod.manifest ?? mod.default;
    if (!manifest) {
      throw new Error(`Manifest module at ${abs} does not export \`manifest\`.`);
    }
    return manifest;
  } finally {
    rmSync(compiled, { force: true });
  }
}
