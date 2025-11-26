// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

// Get directory path - use environment variable or fallback to cwd-based path
// This avoids import.meta issues with Jest/Babel transformation
function getScriptDir(): string {
  // In test environment or when __dirname is available, use it
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }

  // Fallback: use process.cwd() relative path
  // Check if we're already in the definitions package directory
  const cwd = process.cwd();
  if (cwd.endsWith('packages/definitions') || cwd.endsWith('packages/definitions/')) {
    return resolve(cwd, 'src/scripts');
  }
  // Otherwise assume we're at the repo root
  return resolve(cwd, 'packages/definitions/src/scripts');
}

// Use function call to get paths - evaluated at runtime
export function getDefaultPaths(): { fshGeneratedDir: string; profilesMedplumPath: string } {
  const scriptDir = getScriptDir();
  return {
    fshGeneratedDir: resolve(scriptDir, '../../dist/fsh-generated/resources'),
    profilesMedplumPath: resolve(scriptDir, '../../dist/fhir/r4/profiles-medplum.json'),
  };
}

const { fshGeneratedDir: FSH_GENERATED_DIR, profilesMedplumPath: PROFILES_MEDPLUM_PATH } = getDefaultPaths();

interface StructureDefinition {
  id?: string;
  url?: string;
  name?: string;
  differential?: unknown;
  snapshot?: unknown;
  resourceType?: string;
}

interface BundleEntry {
  fullUrl?: string;
  resource?: StructureDefinition;
}

interface Bundle {
  resourceType: string;
  type: string;
  entry?: BundleEntry[];
}

/**
 * Removes id and differential properties from a StructureDefinition
 * @param sd - StructureDefinition to clean
 */
export function cleanStructureDefinition(sd: StructureDefinition): void {
  delete sd.id;
  delete sd.differential;
}

/**
 * Reads all StructureDefinition JSON files from the fsh-generated directory
 * @param fshGeneratedDir - Path to the fsh-generated directory (defaults to standard path)
 * @returns Array of StructureDefinition objects
 */
export function readGeneratedStructureDefinitions(fshGeneratedDir: string = FSH_GENERATED_DIR): StructureDefinition[] {
  const structureDefinitions: StructureDefinition[] = [];

  try {
    const files = readdirSync(fshGeneratedDir);
    const jsonFiles = files.filter((file) => file.endsWith('.json'));

    for (const file of jsonFiles) {
      const filePath = resolve(fshGeneratedDir, file);
      const content = JSON.parse(readFileSync(filePath, 'utf8')) as StructureDefinition | Bundle;

      // Handle both single StructureDefinition and Bundle formats
      if (content.resourceType === 'Bundle' && 'entry' in content && content.entry) {
        for (const entry of content.entry) {
          if (entry.resource?.resourceType === 'StructureDefinition') {
            cleanStructureDefinition(entry.resource);
            structureDefinitions.push(entry.resource);
          }
        }
      } else if (content.resourceType === 'StructureDefinition') {
        cleanStructureDefinition(content);
        structureDefinitions.push(content);
      }
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.warn(`Warning: fsh-generated directory not found at ${fshGeneratedDir}`);
      console.warn('This usually means SUSHI has not been run yet.');
      console.warn('Expected FSH setup:');
      console.warn('  1. FSH source files in: src/fsh/input/fsh/');
      console.warn('  2. SUSHI config at: src/fsh/sushi-config.yaml');
      console.warn('  3. Run "npm run build:fsh" to generate StructureDefinitions');
      return [];
    }
    throw error;
  }

  return structureDefinitions;
}

/**
 * Merges new StructureDefinitions into the existing profiles-medplum.json Bundle
 * @param newStructureDefinitions - Array of StructureDefinition objects to merge
 * @param bundle - Existing Bundle object
 */
export function mergeStructureDefinitions(newStructureDefinitions: StructureDefinition[], bundle: Bundle): void {
  if (!bundle.entry) {
    bundle.entry = [];
  }

  // Create a map of existing entries by URL for quick lookup
  const existingEntriesMap = new Map<string, BundleEntry>();
  for (const entry of bundle.entry) {
    if (entry.resource?.url) {
      existingEntriesMap.set(entry.resource.url, entry);
    }
  }

  // Merge new StructureDefinitions
  for (const sd of newStructureDefinitions) {
    if (!sd.url) {
      console.warn(`Warning: StructureDefinition missing URL, skipping: ${sd.name || sd.id || 'unknown'}`);
      continue;
    }

    const existingEntry = existingEntriesMap.get(sd.url);

    if (existingEntry) {
      // Update existing entry
      existingEntry.resource = sd;
      existingEntry.fullUrl = sd.url;
      console.log(`Updated StructureDefinition: ${sd.url}`);
    } else {
      // Add new entry
      bundle.entry.push({
        fullUrl: sd.url,
        resource: sd,
      });
      console.log(`Added StructureDefinition: ${sd.url}`);
    }
  }
}

/**
 * Main function to build and merge profiles
 * @param profilesMedplumPath - Path to profiles-medplum.json (defaults to standard path)
 * @param fshGeneratedDir - Optional path to fsh-generated directory (defaults to standard path)
 */
export function main(profilesMedplumPath: string = PROFILES_MEDPLUM_PATH, fshGeneratedDir?: string): void {
  console.log('Reading generated StructureDefinitions...');
  const newStructureDefinitions = fshGeneratedDir
    ? readGeneratedStructureDefinitions(fshGeneratedDir)
    : readGeneratedStructureDefinitions();

  if (newStructureDefinitions.length === 0) {
    console.log('No StructureDefinitions found to merge.');
    return;
  }

  console.log(`Found ${newStructureDefinitions.length} StructureDefinition(s) to merge`);

  // Ensure the dist directory exists
  const distDir = dirname(profilesMedplumPath);
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  // Read existing bundle or create a new one
  let bundle: Bundle;
  if (existsSync(profilesMedplumPath)) {
    console.log('Reading existing profiles-medplum.json...');
    bundle = JSON.parse(readFileSync(profilesMedplumPath, 'utf8')) as Bundle;
  } else {
    console.log('Creating new profiles-medplum.json...');
    bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [],
    };
  }

  console.log('Merging StructureDefinitions...');
  mergeStructureDefinitions(newStructureDefinitions, bundle);

  console.log('Writing updated profiles-medplum.json...');
  writeFileSync(profilesMedplumPath, JSON.stringify(bundle, null, 2), 'utf8');

  console.log('Done!');
}

// Only run main if this file is executed directly (not imported)
// Check by comparing process.argv[1] with the script path
// This avoids import.meta which causes issues with Jest/Babel
if (process.argv[1]?.includes('build-profiles')) {
  main();
}
