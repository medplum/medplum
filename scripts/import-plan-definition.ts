// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Script to import a PlanDefinition bundle and resolve definitionCanonical references.
 *
 * This script:
 * 1. Imports the bundle(s) exported by export-plan-definition.ts
 * 2. Resolves urn:uuid: references in definitionCanonical to Resource references (e.g., Questionnaire/123)
 * 3. Updates the PlanDefinition with the resolved references
 *
 * Usage:
 *   node scripts/import-plan-definition.js <bundleFile> [mappingFile]
 *
 * Or with environment variables:
 *   MEDPLUM_BASE_URL=https://api.medplum.com/ \
 *   MEDPLUM_CLIENT_ID=your-client-id \
 *   MEDPLUM_CLIENT_SECRET=your-client-secret \
 *   node scripts/import-plan-definition.js <bundleFile> [mappingFile]
 */

import { MedplumClient } from '@medplum/core';
import type { Bundle, PlanDefinition } from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

// Load environment variables from .env file
// Note: Using synchronous import since we're in a script context
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require('dotenv');
  dotenv.config({ quiet: true });
} catch {
  // dotenv not available, continue without it
}

interface MappingData {
  fullUrlToIdentifier: Record<string, { resourceType: string; identifier: { system: string; value: string } }>;
  note?: string;
}

/**
 * Resolves definitionCanonical references in a PlanDefinition after bundle import
 * @param medplum - The Medplum client instance
 * @param bundleResponse - The response bundle from importing the exported bundle
 * @param planDefinition - The PlanDefinition that needs its references resolved
 * @param fullUrlToIdentifier - Mapping from fullUrl to identifier for resolution
 * @returns The PlanDefinition with resolved definitionCanonical references
 */
function resolvePlanDefinitionReferences(
  medplum: MedplumClient,
  bundleResponse: Bundle,
  planDefinition: PlanDefinition,
  fullUrlToIdentifier: Map<string, { resourceType: string; identifier: { system: string; value: string } }>
): PlanDefinition {
  // Create a map from fullUrl (urn:uuid) to actual resource ID from the response
  const fullUrlToResourceId = new Map<string, string>();

  if (bundleResponse.entry) {
    for (const entry of bundleResponse.entry) {
      if (entry.fullUrl && entry.resource?.id) {
        fullUrlToResourceId.set(entry.fullUrl, entry.resource.id);
      }
    }
  }

  // Also create a map from identifier to resource ID for fallback resolution
  const identifierToResourceId = new Map<string, string>();
  if (bundleResponse.entry) {
    for (const entry of bundleResponse.entry) {
      if (entry.resource?.identifier && entry.resource.identifier.length > 0 && entry.resource.id) {
        const identifier = entry.resource.identifier[0];
        const key = `${entry.resource.resourceType}:${identifier.system}|${identifier.value}`;
        identifierToResourceId.set(key, entry.resource.id);
      }
    }
  }

  // Clone the PlanDefinition
  const resolved = JSON.parse(JSON.stringify(planDefinition)) as PlanDefinition;

  // Resolve definitionCanonical references recursively
  const resolveActionReferences = (actions: any[]): void => {
    for (const action of actions) {
      if (action.definitionCanonical) {
        const ref = action.definitionCanonical;

        if (ref.startsWith('urn:uuid:')) {
          // Try to resolve from fullUrl map first
          const resourceId = fullUrlToResourceId.get(ref);
          if (resourceId) {
            // Find the resource type from the identifier map
            const identifierInfo = fullUrlToIdentifier.get(ref);
            if (identifierInfo) {
              action.definitionCanonical = `${identifierInfo.resourceType}/${resourceId}`;
            } else {
              // Fallback: try to find resource type from response bundle
              const entry = bundleResponse.entry?.find(e => e.fullUrl === ref);
              if (entry?.resource) {
                action.definitionCanonical = `${entry.resource.resourceType}/${resourceId}`;
              }
            }
          } else {
            // Fallback: try to resolve by identifier
            const identifierInfo = fullUrlToIdentifier.get(ref);
            if (identifierInfo) {
              const key = `${identifierInfo.resourceType}:${identifierInfo.identifier.system}|${identifierInfo.identifier.value}`;
              const resourceId = identifierToResourceId.get(key);
              if (resourceId) {
                action.definitionCanonical = `${identifierInfo.resourceType}/${resourceId}`;
              }
            }
          }
        }
      }

      if (action.action) {
        resolveActionReferences(action.action);
      }
    }
  };

  if (resolved.action) {
    resolveActionReferences(resolved.action);
  }

  return resolved;
}

/**
 * Imports a PlanDefinition bundle and resolves definitionCanonical references
 * @param medplum - The Medplum client instance
 * @param bundle - The bundle to import
 * @param mappingData - Optional mapping data from the export
 * @returns The resolved PlanDefinition
 */
export async function importPlanDefinitionBundle(
  medplum: MedplumClient,
  bundle: Bundle,
  mappingData?: MappingData
): Promise<PlanDefinition> {
  console.log('Importing bundle...');

  // Import the bundle
  const bundleResponse = await medplum.executeBatch(bundle);

  if (!bundleResponse.entry || bundleResponse.entry.length === 0) {
    throw new Error('Bundle import returned no entries');
  }

  // Check for errors in the response
  const errors = bundleResponse.entry.filter(
    entry => entry.response?.status && !entry.response.status.startsWith('2')
  );

  if (errors.length > 0) {
    console.warn(`⚠️  ${errors.length} entry/entries had errors during import:`);
    for (const error of errors) {
      console.warn(`  - ${error.response?.status}: ${error.response?.outcome?.issue?.[0]?.details?.text || 'Unknown error'}`);
    }
  }

  // Find the PlanDefinition in the response
  const planDefEntry = bundleResponse.entry.find(
    entry => entry.resource?.resourceType === 'PlanDefinition'
  );

  if (!planDefEntry?.resource) {
    throw new Error('No PlanDefinition found in bundle response');
  }

  const planDefinition = planDefEntry.resource as PlanDefinition;
  console.log(`✓ Found PlanDefinition: ${planDefinition.id || 'unknown'}`);

  // Convert mapping data to Map if provided
  const fullUrlToIdentifier = mappingData?.fullUrlToIdentifier
    ? new Map(Object.entries(mappingData.fullUrlToIdentifier).map(([key, value]) => [key, value]))
    : new Map();

  // Resolve the definitionCanonical references
  console.log('Resolving definitionCanonical references...');
  const resolved = await resolvePlanDefinitionReferences(
    medplum,
    bundleResponse,
    planDefinition,
    fullUrlToIdentifier
  );

  // Count how many references were resolved
  let resolvedCount = 0;
  const countResolved = (actions: any[]): void => {
    for (const action of actions) {
      if (action.definitionCanonical && action.definitionCanonical.startsWith('urn:uuid:')) {
        resolvedCount++; // Still unresolved
      } else if (action.definitionCanonical && action.definitionCanonical.includes('/')) {
        resolvedCount++; // Resolved to Resource reference
      }
      if (action.action) {
        countResolved(action.action);
      }
    }
  };
  if (resolved.action) {
    countResolved(resolved.action);
  }

  console.log(`✓ Resolved ${resolvedCount} definitionCanonical reference(s)`);

  // Update the PlanDefinition with resolved references
  console.log('Updating PlanDefinition with resolved references...');
  const updated = await medplum.updateResource(resolved);

  console.log(`✓ PlanDefinition updated successfully: ${updated.id}`);
  console.log(`  Resource URL: ${medplum.getBaseUrl()}fhir/R4/PlanDefinition/${updated.id}`);

  return updated;
}

/**
 * CLI entry point
 * @returns Promise that resolves when the import is complete
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node scripts/import-plan-definition.js <bundleFile> [mappingFile]');
    console.error('');
    console.error('Arguments:');
    console.error('  bundleFile   - Path to the bundle JSON file to import');
    console.error('  mappingFile  - Optional path to the mapping JSON file (default: <bundleFile>-mapping.json)');
    console.error('');
    console.error('Environment variables (target project):');
    console.error('  MEDPLUM_TARGET_BASE_URL - Medplum server base URL (default: https://api.medplum.com/)');
    console.error('  MEDPLUM_TARGET_CLIENT_ID - OAuth client ID for target project');
    console.error('  MEDPLUM_TARGET_CLIENT_SECRET - OAuth client secret for target project');
    console.error('');
    console.error('Legacy variables (also supported):');
    console.error('  MEDPLUM_BASE_URL, MEDPLUM_CLIENT_ID, MEDPLUM_CLIENT_SECRET');
    console.error('');
    console.error('You can create a .env file in the project root with these variables.');
    process.exit(1);
  }

  const bundleFile = args[0];
  const mappingFile = args[1] || bundleFile.replace('.json', '-mapping.json');

  // Use target project credentials (for import)
  const baseUrl = process.env.MEDPLUM_TARGET_BASE_URL || process.env.MEDPLUM_BASE_URL || 'https://api.medplum.com/';
  const clientId = process.env.MEDPLUM_TARGET_CLIENT_ID || process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_TARGET_CLIENT_SECRET || process.env.MEDPLUM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Error: Target project credentials are required');
    console.error('  Set MEDPLUM_TARGET_CLIENT_ID and MEDPLUM_TARGET_CLIENT_SECRET');
    console.error('  Or use legacy: MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET');
    console.error('');
    console.error('You can create a .env file in the project root with:');
    console.error('  MEDPLUM_TARGET_BASE_URL=https://api.medplum.com/');
    console.error('  MEDPLUM_TARGET_CLIENT_ID=your-target-client-id');
    console.error('  MEDPLUM_TARGET_CLIENT_SECRET=your-target-client-secret');
    process.exit(1);
  }

  const medplum = new MedplumClient({
    baseUrl,
    clientId,
    clientSecret,
  });

  try {
    // Verify authentication first
    try {
      await medplum.getProfile();
      console.log('✓ Authentication successful');
    } catch (authError) {
      console.error('✗ Authentication failed. Please check your MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET.');
      console.error('  Make sure you have valid credentials for the target project.');
      process.exit(1);
    }

    // Read the bundle file
    console.log(`Reading bundle from: ${bundleFile}`);
    const bundleContent = readFileSync(bundleFile, 'utf8');
    const bundle = JSON.parse(bundleContent) as Bundle;

    if (bundle.resourceType !== 'Bundle') {
      throw new Error('File does not contain a valid FHIR Bundle');
    }

    console.log(`✓ Bundle loaded: ${bundle.entry?.length || 0} entries`);

    // Try to read the mapping file (optional)
    let mappingData: MappingData | undefined;
    try {
      const mappingContent = readFileSync(mappingFile, 'utf8');
      mappingData = JSON.parse(mappingContent) as MappingData;
      console.log(`✓ Mapping file loaded: ${mappingFile}`);
    } catch (error) {
      console.warn(`⚠️  Could not read mapping file: ${mappingFile}`);
      console.warn('  References will be resolved using bundle response only');
    }

    // Import and resolve
    const result = await importPlanDefinitionBundle(medplum, bundle, mappingData);

    console.log('');
    console.log('✓ Import completed successfully!');
    console.log(`  PlanDefinition ID: ${result.id}`);
    console.log(`  View at: ${medplum.getBaseUrl()}fhir/R4/PlanDefinition/${result.id}`);
  } catch (error: any) {
    console.error('✗ Import failed');

    // Provide more helpful error messages
    if (error.outcome) {
      const issue = error.outcome.issue?.[0];
      if (issue) {
        console.error(`  Error: ${issue.details?.text || issue.code}`);
        if (issue.diagnostics) {
          console.error(`  Details: ${issue.diagnostics}`);
        }
      }
    } else if (error.message) {
      console.error(`  Error: ${error.message}`);
    } else {
      console.error('  Unknown error:', error);
    }

    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Verify the bundle file is valid JSON');
    console.error('  2. Check that your credentials have access to the target project');
    console.error('  3. Ensure the bundle was exported correctly');

    process.exit(1);
  }
}

// Run if executed directly
// Check if this is the main module (works for both CommonJS and ES modules)
const isMainModule = (() => {
  // CommonJS check
  try {
    if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
      return true;
    }
  } catch {
    // Not CommonJS
  }

  // ES module: check if import.meta.url matches the file being executed
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    try {
      const currentFile = fileURLToPath(import.meta.url);
      const mainFile = process.argv[1];
      // Compare file paths (normalize for comparison)
      return currentFile === mainFile ||
             currentFile.replace(/\.ts$/, '.js') === mainFile ||
             pathToFileURL(mainFile).href === import.meta.url;
    } catch {
      // If we can't determine but it's a CLI invocation, assume it's the main module
      return process.argv.length > 1;
    }
  }
  return false;
})();

if (isMainModule) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
