// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type * as NodeFs from 'node:fs';
import { vi } from 'vitest';

const manifestState = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join, resolve } = require('node:path');
  const DATA_DIR = resolve('./src/migrations/data');
  const manifestPath = join(DATA_DIR, 'data-version-manifest.json');
  const manifestFixture =
    JSON.stringify(
      {
        v1: { serverVersion: '3.3.0', requiredBefore: '4.0.0' },
        v2: { serverVersion: '4.0.1' },
      },
      null,
      2
    ) + '\n';

  return {
    DATA_DIR,
    manifestPath,
    manifestFixture,
    updatedManifest: undefined as string | undefined,
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return {
    ...actual,
    readFileSync: vi.fn((path, options) => {
      if (path === manifestState.manifestPath) {
        return manifestState.manifestFixture;
      }
      return actual.readFileSync(path, options);
    }),
    writeFileSync: vi.fn((path, data) => {
      if (path !== manifestState.manifestPath) {
        throw new Error(`Tried to write to unexpected file ${path}`);
      }
      if (typeof data === 'string') {
        manifestState.updatedManifest = data;
      } else {
        throw new Error(`Data type ${typeof data} not yet handled in writeFileSync test stub`);
      }
    }),
  };
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as loggerModule from '../logger';
import * as migrate from './migrate';
import { addDataMigrationToManifest, buildMigrationExports, DATA_DIR, runFromCli, SCHEMA_DIR } from './migrate-main';
import { getPostDeployMigrationVersions, getPreDeployMigrationVersions } from './migration-versions';

describe('addDataMigrationToManifest', () => {
  beforeEach(() => {
    manifestState.updatedManifest = undefined;
  });

  test('adds new entry with incremented patch version', () => {
    const testVersion = 'v9999';

    addDataMigrationToManifest(testVersion);
    const updatedManifest = manifestState.updatedManifest;
    if (typeof updatedManifest !== 'string') {
      throw new Error('Manifest was not updated');
    }
    const result = JSON.parse(updatedManifest);

    expect(result[testVersion]).toBeDefined();
    expect(result[testVersion].serverVersion).toMatch(/^\d+\.\d+\.\d+$/);

    // Verify it's a patch increment from the current version (5.0.10 -> 5.0.11)
    const serverVersion = result[testVersion].serverVersion;
    const [major, _minor, patch] = serverVersion.split('.').map(Number);
    expect(major).toBeGreaterThanOrEqual(5);
    expect(patch).toBeGreaterThan(0);
  });

  test('preserves existing manifest entries', () => {
    const originalParsed = JSON.parse(manifestState.manifestFixture);
    const existingKeys = Object.keys(originalParsed);

    addDataMigrationToManifest('v9999');
    const updatedManifest = manifestState.updatedManifest;
    if (typeof updatedManifest !== 'string') {
      throw new Error('Manifest was not updated');
    }
    const result = JSON.parse(updatedManifest);

    // All original entries should still exist
    for (const key of existingKeys) {
      expect(result[key]).toEqual(originalParsed[key]);
    }
  });

  test('writes file with proper JSON formatting and trailing newline', () => {
    addDataMigrationToManifest('v9999');
    const updatedManifest = manifestState.updatedManifest;
    if (typeof updatedManifest !== 'string') {
      throw new Error('Manifest was not updated');
    }

    // Should end with newline
    expect(updatedManifest.endsWith('\n')).toBe(true);

    // Should be properly indented (2 spaces)
    expect(updatedManifest).toContain('  "v9999"');
  });

  test('appends new entry at end of manifest object', () => {
    addDataMigrationToManifest('v9999');
    const updatedManifest = manifestState.updatedManifest;
    if (typeof updatedManifest !== 'string') {
      throw new Error('Manifest was not updated');
    }

    const places = {
      v1: updatedManifest.indexOf('v1'),
      v2: updatedManifest.indexOf('v2'),
      v9999: updatedManifest.indexOf('v9999'),
    };

    expect(places.v1).toBeLessThan(places.v2);
    expect(places.v2).toBeLessThan(places.v9999);
  });
});

describe('buildMigrationExports', () => {
  test('exports versions in numeric order, guarding each digit-count boundary', () => {
    const guard = [
      '/* CAUTION: LOAD-BEARING COMMENT */',
      '/* This comment prevents auto-organization of imports in VSCode which would break the numeric ordering of the migrations. */',
    ];
    const output = buildMigrationExports([8, 9, 10, 11, 99, 100, 101]);

    // Guards belong only where the digit count grows — before v10 and v100, not v9, v11 or v101
    expect(output.slice(output.indexOf('export * as'))).toStrictEqual(
      [
        `export * as v8 from './v8';`,
        `export * as v9 from './v9';`,
        ...guard,
        `export * as v10 from './v10';`,
        `export * as v11 from './v11';`,
        `export * as v99 from './v99';`,
        ...guard,
        `export * as v100 from './v100';`,
        `export * as v101 from './v101';`,
        '',
      ].join('\n')
    );
  });

  test('reproduces the checked-in index files', () => {
    expect(buildMigrationExports(getPreDeployMigrationVersions())).toStrictEqual(
      readFileSync(join(SCHEMA_DIR, 'index.ts'), 'utf8')
    );
    expect(buildMigrationExports(getPostDeployMigrationVersions())).toStrictEqual(
      readFileSync(join(DATA_DIR, 'index.ts'), 'utf8')
    );
  });
});

describe('runFromCli', () => {
  test('logs and exits via exitAfterStdoutDrain when main rejects', async () => {
    const exitDrainSpy = vi.spyOn(loggerModule, 'exitAfterStdoutDrain').mockResolvedValue();
    const errorSpy = vi.spyOn(loggerModule.globalLogger, 'error').mockImplementation(() => undefined);
    const indexSpy = vi.spyOn(migrate, 'indexStructureDefinitionsAndSearchParameters').mockImplementation(() => {
      throw new Error('boom');
    });

    await runFromCli();

    expect(indexSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0]).toBe('Migration failed');
    expect(exitDrainSpy).toHaveBeenCalledTimes(1);

    exitDrainSpy.mockRestore();
    errorSpy.mockRestore();
    indexSpy.mockRestore();
  });
});
