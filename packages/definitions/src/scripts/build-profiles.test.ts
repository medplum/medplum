// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  cleanStructureDefinition,
  main,
  mergeStructureDefinitions,
  readGeneratedStructureDefinitions,
} from './build-profiles';

describe('build-profiles', () => {
  let testDir: string;
  let testProfilesPath: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    testDir = join(tmpdir(), `build-profiles-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testProfilesPath = join(testDir, 'profiles-medplum.json');
  });

  afterEach(() => {
    // Clean up test directory
    try {
      if (testProfilesPath && existsSync(testProfilesPath)) {
        unlinkSync(testProfilesPath);
      }
      if (testDir && existsSync(testDir)) {
        rmdirSync(testDir, { recursive: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('cleanStructureDefinition', () => {
    test('removes id and differential properties', () => {
      const sd: any = {
        id: 'test-id',
        url: 'https://example.com/test',
        differential: { element: [] },
        snapshot: { element: [] },
      };

      cleanStructureDefinition(sd);

      expect(sd.id).toBeUndefined();
      expect(sd.differential).toBeUndefined();
      expect(sd.url).toBe('https://example.com/test');
      expect(sd.snapshot).toBeDefined();
    });

    test('handles missing properties gracefully', () => {
      const sd: any = {
        url: 'https://example.com/test',
      };

      expect(() => cleanStructureDefinition(sd)).not.toThrow();
      expect(sd.url).toBe('https://example.com/test');
    });
  });

  describe('readGeneratedStructureDefinitions', () => {
    test('returns empty array when directory does not exist', () => {
      const result = readGeneratedStructureDefinitions('/non-existent-directory');
      expect(result).toEqual([]);
    });

    test('reads and parses StructureDefinition files', () => {
      const fshDir = join(testDir, 'fsh-generated', 'resources');
      mkdirSync(fshDir, { recursive: true });

      const sd1 = {
        resourceType: 'StructureDefinition',
        id: 'test-1',
        url: 'https://medplum.com/fhir/StructureDefinition/test-1',
        name: 'Test1',
        differential: { element: [] },
        snapshot: { element: [] },
      };

      const sd2 = {
        resourceType: 'StructureDefinition',
        id: 'test-2',
        url: 'https://medplum.com/fhir/StructureDefinition/test-2',
        name: 'Test2',
        snapshot: { element: [] },
      };

      writeFileSync(join(fshDir, 'StructureDefinition-test-1.json'), JSON.stringify(sd1));
      writeFileSync(join(fshDir, 'StructureDefinition-test-2.json'), JSON.stringify(sd2));

      const result = readGeneratedStructureDefinitions(fshDir);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBeUndefined();
      expect(result[0].differential).toBeUndefined();
      expect(result[0].url).toBe('https://medplum.com/fhir/StructureDefinition/test-1');
      expect(result[1].id).toBeUndefined();
      expect(result[1].url).toBe('https://medplum.com/fhir/StructureDefinition/test-2');
    });

    test('handles Bundle format', () => {
      const fshDir = join(testDir, 'fsh-generated', 'resources');
      mkdirSync(fshDir, { recursive: true });

      const bundle = {
        resourceType: 'Bundle',
        entry: [
          {
            resource: {
              resourceType: 'StructureDefinition',
              id: 'test-bundle',
              url: 'https://medplum.com/fhir/StructureDefinition/test-bundle',
              name: 'TestBundle',
              differential: { element: [] },
              snapshot: { element: [] },
            },
          },
        ],
      };

      writeFileSync(join(fshDir, 'bundle.json'), JSON.stringify(bundle));

      const result = readGeneratedStructureDefinitions(fshDir);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBeUndefined();
      expect(result[0].differential).toBeUndefined();
      expect(result[0].url).toBe('https://medplum.com/fhir/StructureDefinition/test-bundle');
    });

    test('filters out non-JSON files', () => {
      const fshDir = join(testDir, 'fsh-generated', 'resources');
      mkdirSync(fshDir, { recursive: true });

      const sd = {
        resourceType: 'StructureDefinition',
        url: 'https://medplum.com/fhir/StructureDefinition/test',
        snapshot: { element: [] },
      };

      writeFileSync(join(fshDir, 'StructureDefinition-test.json'), JSON.stringify(sd));
      writeFileSync(join(fshDir, 'not-a-json.txt'), 'not json');

      const result = readGeneratedStructureDefinitions(fshDir);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://medplum.com/fhir/StructureDefinition/test');
    });
  });

  describe('mergeStructureDefinitions', () => {
    test('creates entry array if missing', () => {
      const bundle: any = {
        resourceType: 'Bundle',
        type: 'collection',
      };

      const sd = {
        url: 'https://medplum.com/fhir/StructureDefinition/test',
        name: 'Test',
        snapshot: { element: [] },
      };

      mergeStructureDefinitions([sd], bundle);

      expect(bundle.entry).toBeDefined();
      expect(bundle.entry).toHaveLength(1);
      expect(bundle.entry[0].fullUrl).toBe('https://medplum.com/fhir/StructureDefinition/test');
      expect(bundle.entry[0].resource).toEqual(sd);
    });

    test('adds new StructureDefinitions', () => {
      const bundle: any = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [],
      };

      const sd1 = {
        url: 'https://medplum.com/fhir/StructureDefinition/test-1',
        name: 'Test1',
        snapshot: { element: [] },
      };

      const sd2 = {
        url: 'https://medplum.com/fhir/StructureDefinition/test-2',
        name: 'Test2',
        snapshot: { element: [] },
      };

      mergeStructureDefinitions([sd1, sd2], bundle);

      expect(bundle.entry).toHaveLength(2);
      expect(bundle.entry[0].fullUrl).toBe('https://medplum.com/fhir/StructureDefinition/test-1');
      expect(bundle.entry[1].fullUrl).toBe('https://medplum.com/fhir/StructureDefinition/test-2');
    });

    test('updates existing StructureDefinitions by URL', () => {
      const existingSd = {
        url: 'https://medplum.com/fhir/StructureDefinition/test',
        name: 'OldName',
        snapshot: { element: [] },
      };

      const bundle: any = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          {
            fullUrl: 'https://medplum.com/fhir/StructureDefinition/test',
            resource: existingSd,
          },
        ],
      };

      const newSd = {
        url: 'https://medplum.com/fhir/StructureDefinition/test',
        name: 'NewName',
        snapshot: { element: [{ id: 'new-element' }] },
      };

      mergeStructureDefinitions([newSd], bundle);

      expect(bundle.entry).toHaveLength(1);
      expect(bundle.entry[0].resource.name).toBe('NewName');
      expect(bundle.entry[0].resource.snapshot.element).toHaveLength(1);
    });

    test('skips StructureDefinitions without URL', () => {
      const bundle: any = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [],
      };

      const sdWithUrl = {
        url: 'https://medplum.com/fhir/StructureDefinition/test',
        name: 'Test',
        snapshot: { element: [] },
      };

      const sdWithoutUrl: any = {
        name: 'NoUrl',
        snapshot: { element: [] },
      };

      // Mock console.warn to verify it's called
      const originalWarn = console.warn;
      const warnSpy = jest.fn();
      console.warn = warnSpy;

      mergeStructureDefinitions([sdWithUrl, sdWithoutUrl], bundle);

      expect(bundle.entry).toHaveLength(1);
      expect(bundle.entry[0].resource).toEqual(sdWithUrl);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Warning: StructureDefinition missing URL'));

      console.warn = originalWarn;
    });

    test('handles empty array', () => {
      const bundle: any = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [],
      };

      mergeStructureDefinitions([], bundle);

      expect(bundle.entry).toHaveLength(0);
    });
  });

  describe('readGeneratedStructureDefinitions error handling', () => {
    test('throws non-ENOENT errors', () => {
      // Use a directory that exists but will cause a different error
      // We'll use a file instead of a directory to trigger a non-ENOENT error
      const testFile = join(testDir, 'not-a-dir');
      writeFileSync(testFile, 'not a directory');

      expect(() => {
        readGeneratedStructureDefinitions(testFile);
      }).toThrow();
    });
  });

  describe('main', () => {
    test('handles empty StructureDefinitions gracefully', () => {
      const testProfilesPath = join(testDir, 'profiles-medplum.json');
      const nonExistentFshDir = join(testDir, 'non-existent-fsh-dir');

      // Call main with explicit paths to non-existent FSH directory
      // This will trigger the ENOENT path and return empty array
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      main(testProfilesPath, nonExistentFshDir);

      expect(logSpy).toHaveBeenCalledWith('No StructureDefinitions found to merge.');
      expect(existsSync(testProfilesPath)).toBe(false);

      logSpy.mockRestore();
    });

    test('creates new bundle when file does not exist', () => {
      const testProfilesPath = join(testDir, 'profiles-medplum.json');
      const fshDir = join(testDir, 'fsh-generated', 'resources');
      mkdirSync(fshDir, { recursive: true });

      const sd = {
        resourceType: 'StructureDefinition',
        url: 'https://medplum.com/fhir/StructureDefinition/test',
        name: 'Test',
        snapshot: { element: [] },
      };

      writeFileSync(join(fshDir, 'StructureDefinition-test.json'), JSON.stringify(sd));

      // Call main with explicit paths
      main(testProfilesPath, fshDir);

      expect(existsSync(testProfilesPath)).toBe(true);
      const bundle = JSON.parse(readFileSync(testProfilesPath, 'utf8'));
      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.entry).toHaveLength(1);
      expect(bundle.entry[0].resource.url).toBe('https://medplum.com/fhir/StructureDefinition/test');
    });

    test('updates existing bundle', () => {
      const testProfilesPath = join(testDir, 'profiles-medplum.json');
      const fshDir = join(testDir, 'fsh-generated', 'resources');
      mkdirSync(fshDir, { recursive: true });

      // Create existing bundle
      const existingBundle = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          {
            fullUrl: 'https://medplum.com/fhir/StructureDefinition/test',
            resource: {
              resourceType: 'StructureDefinition',
              url: 'https://medplum.com/fhir/StructureDefinition/test',
              name: 'OldName',
              snapshot: { element: [] },
            },
          },
        ],
      };
      writeFileSync(testProfilesPath, JSON.stringify(existingBundle));

      // Create new StructureDefinition
      const sd = {
        resourceType: 'StructureDefinition',
        url: 'https://medplum.com/fhir/StructureDefinition/test',
        name: 'NewName',
        snapshot: { element: [{ id: 'new-element' }] },
      };
      writeFileSync(join(fshDir, 'StructureDefinition-test.json'), JSON.stringify(sd));

      // Call main with explicit paths
      main(testProfilesPath, fshDir);

      const bundle = JSON.parse(readFileSync(testProfilesPath, 'utf8'));
      expect(bundle.entry).toHaveLength(1);
      expect(bundle.entry[0].resource.name).toBe('NewName');
    });
  });
});
