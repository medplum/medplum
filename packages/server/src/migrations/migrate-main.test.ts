// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { join } from 'node:path';
import { addDataMigrationToManifest, DATA_DIR } from './migrate-main';

const originalReadFileSync = fs.readFileSync;

describe('addDataMigrationToManifest', () => {
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

  let updatedManifest: string | undefined = undefined;

  beforeAll(() => {
    updatedManifest = undefined;
    jest.spyOn(fs, 'readFileSync').mockImplementation((path, options) => {
      if (path === manifestPath) {
        return manifestFixture;
      }
      // Jest seems to rely on readFileSync in some situations - defer to the original
      // function for paths other than the manifest
      return originalReadFileSync(path, options);
    });
    jest.spyOn(fs, 'writeFileSync').mockImplementation((path, data) => {
      if (path !== manifestPath) {
        throw new Error(`Tried to write to unexpected file ${path}`);
      }
      if (typeof data === 'string') {
        updatedManifest = data.toString();
      } else {
        throw new Error(`Data type ${typeof data} not yet handled in writeFileSync test stub`);
      }
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('adds new entry with incremented patch version', () => {
    const testVersion = 'v9999';

    addDataMigrationToManifest(testVersion);
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
    const originalParsed = JSON.parse(manifestFixture);
    const existingKeys = Object.keys(originalParsed);

    addDataMigrationToManifest('v9999');
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
