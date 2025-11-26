// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/* global console */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FSH_GENERATED_DIR = resolve(__dirname, '../dist/fsh-generated/resources');
const PROFILES_MEDPLUM_PATH = resolve(__dirname, '../dist/fhir/r4/profiles-medplum.json');

/**
 * Removes id and differential properties from a StructureDefinition
 * @param sd - StructureDefinition to clean
 */
function cleanStructureDefinition(sd) {
  delete sd.id;
  delete sd.differential;
}

/**
 * Reads all StructureDefinition JSON files from the fsh-generated directory
 * @returns Array of StructureDefinition objects
 */
function readGeneratedStructureDefinitions() {
  const structureDefinitions = [];

  try {
    const files = readdirSync(FSH_GENERATED_DIR);
    const jsonFiles = files.filter((file) => file.endsWith('.json'));

    for (const file of jsonFiles) {
      const filePath = resolve(FSH_GENERATED_DIR, file);
      const content = JSON.parse(readFileSync(filePath, 'utf8'));

      // Handle both single StructureDefinition and Bundle formats
      if (content.resourceType === 'Bundle' && content.entry) {
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
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`Warning: fsh-generated directory not found at ${FSH_GENERATED_DIR}`);
      console.warn('Run "npm run build:fsh" first to generate StructureDefinitions');
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
function mergeStructureDefinitions(newStructureDefinitions, bundle) {
  if (!bundle.entry) {
    bundle.entry = [];
  }

  // Create a map of existing entries by URL for quick lookup
  const existingEntriesMap = new Map();
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
 */
function main() {
  console.log('Reading generated StructureDefinitions...');
  const newStructureDefinitions = readGeneratedStructureDefinitions();

  if (newStructureDefinitions.length === 0) {
    console.log('No StructureDefinitions found to merge.');
    return;
  }

  console.log(`Found ${newStructureDefinitions.length} StructureDefinition(s) to merge`);

  // Ensure the dist directory exists
  const distDir = dirname(PROFILES_MEDPLUM_PATH);
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  // Read existing bundle or create a new one
  let bundle;
  if (existsSync(PROFILES_MEDPLUM_PATH)) {
    console.log('Reading existing profiles-medplum.json...');
    bundle = JSON.parse(readFileSync(PROFILES_MEDPLUM_PATH, 'utf8'));
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
  writeFileSync(PROFILES_MEDPLUM_PATH, JSON.stringify(bundle, null, 2), 'utf8');

  console.log('Done!');
}

main();
