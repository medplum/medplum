// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Script to export a PlanDefinition and all resources it references.
 *
 * This script recursively finds all resources referenced by a PlanDefinition,
 * including:
 * - Questionnaire resources (via action.definitionCanonical)
 * - ActivityDefinition resources (via action.definitionCanonical)
 * - StructureMap resources (via action.transform)
 * - Library resources (via library)
 * - Related resources (via relatedArtifact)
 * - Nested references within those resources
 *
 * The output is a FHIR Bundle (or multiple bundles) that can be uploaded
 * to another Medplum project.
 *
 * Usage:
 *   node scripts/export-plan-definition.js <planDefinitionId> [outputFile]
 *
 * Or with environment variables:
 *   MEDPLUM_BASE_URL=https://api.medplum.com/ \
 *   MEDPLUM_CLIENT_ID=your-client-id \
 *   MEDPLUM_CLIENT_SECRET=your-client-secret \
 *   node scripts/export-plan-definition.js <planDefinitionId> [outputFile]
 */

import { MedplumClient, isReference } from '@medplum/core';
import type {
  ActivityDefinition,
  Bundle,
  BundleEntry,
  Library,
  PlanDefinition,
  Questionnaire,
  Reference,
  Resource,
  ResourceType,
  StructureMap,
} from '@medplum/fhirtypes';
import { writeFileSync } from 'fs';
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

interface ExportOptions {
  /** Maximum number of entries per bundle (default: 500) */
  maxEntriesPerBundle?: number;
  /** Whether to clean metadata before export (default: true) */
  cleanMetadata?: boolean;
  /** Whether to include nested PlanDefinitions (default: true) */
  includeNestedPlanDefinitions?: boolean;
}

interface ExportResult {
  bundles: Bundle[];
  resourceCount: number;
  resourceMap: Map<string, string>; // original reference -> internal reference
  fullUrlToIdentifier: Map<string, { resourceType: string; identifier: { system: string; value: string } }>; // fullUrl -> identifier for post-import resolution
}

/**
 * Exports a PlanDefinition with all referenced resources,
 * transforming external references to internal references for import into a new project.
 */
export class PlanDefinitionExporter {
  private medplum: MedplumClient;
  private resourceMap = new Map<string, string>(); // original reference -> internal reference
  private internalRefToResource = new Map<string, Resource>(); // internal reference -> resource
  private fullUrlToIdentifier = new Map<
    string,
    { resourceType: string; identifier: { system: string; value: string } }
  >(); // fullUrl -> identifier
  private processedResources = new Set<string>(); // track processed resource references
  private bundleEntries: BundleEntry[] = [];
  private options: Required<ExportOptions>;

  constructor(medplum: MedplumClient, options: ExportOptions = {}) {
    this.medplum = medplum;
    this.options = {
      maxEntriesPerBundle: options.maxEntriesPerBundle ?? 500,
      cleanMetadata: options.cleanMetadata ?? true,
      includeNestedPlanDefinitions: options.includeNestedPlanDefinitions ?? true,
    };
  }

  /**
   * Export a PlanDefinition and all its referenced resources
   * @param planDefinitionId - The ID of the PlanDefinition to export
   * @returns Export result containing bundles and resource mapping
   */
  async exportPlanDefinition(planDefinitionId: string): Promise<ExportResult> {
    // Reset state for new export
    this.resourceMap.clear();
    this.internalRefToResource.clear();
    this.fullUrlToIdentifier.clear();
    this.processedResources.clear();
    this.bundleEntries = [];

    // Fetch the main PlanDefinition
    const planDefinition = await this.medplum.readResource('PlanDefinition', planDefinitionId);

    // Process the PlanDefinition and all its references
    await this.processPlanDefinition(planDefinition);

    // Process all regular references in the PlanDefinition
    await this.processReferencesInResource(planDefinition);

    // Split into multiple bundles if needed
    const bundles = this.splitIntoBundles();

    return {
      bundles,
      resourceCount: this.bundleEntries.length,
      resourceMap: new Map(this.resourceMap),
      fullUrlToIdentifier: new Map(this.fullUrlToIdentifier),
    };
  }

  private async processPlanDefinition(planDefinition: PlanDefinition): Promise<void> {
    const originalRef = `PlanDefinition/${planDefinition.id}`;
    if (this.resourceMap.has(originalRef)) {
      return; // Already processed
    }

    const internalRef = this.generateInternalReference('PlanDefinition');
    this.resourceMap.set(originalRef, internalRef);
    this.internalRefToResource.set(internalRef, planDefinition);

    // Process actions recursively to find referenced resources
    if (planDefinition.action) {
      for (const action of planDefinition.action) {
        await this.processAction(action);
      }
    }

    // Process library references
    if (planDefinition.library) {
      for (const libraryRef of planDefinition.library) {
        await this.processLibraryReference(libraryRef);
      }
    }

    // Process relatedArtifact references
    if (planDefinition.relatedArtifact) {
      for (const artifact of planDefinition.relatedArtifact) {
        if (artifact.resource) {
          await this.processCanonicalReference(artifact.resource);
        }
      }
    }

    // Ensure canonical URL and identifier before transformation
    this.ensureCanonicalUrl(planDefinition);
    this.ensureIdentifier(planDefinition);

    // Transform references in the PlanDefinition
    const transformedPlanDefinition = this.transformReferences(planDefinition);

    // Add to bundle
    this.addToBundleWithInternalReference(transformedPlanDefinition, internalRef);
  }

  private async processAction(action: any): Promise<void> {
    // Process definitionCanonical references
    if (action.definitionCanonical) {
      await this.processCanonicalReference(action.definitionCanonical);
    }

    // Process definitionUri references
    if (action.definitionUri) {
      // URI references are typically external and don't need to be included
      // but we could handle them if needed
    }

    // Process transform references (StructureMap)
    if (action.transform) {
      await this.processCanonicalReference(action.transform);
    }

    // Process nested actions
    if (action.action) {
      for (const nestedAction of action.action) {
        await this.processAction(nestedAction);
      }
    }

    // Process dynamicValue expressions (they might reference libraries)
    if (action.dynamicValue) {
      for (const dv of action.dynamicValue) {
        if (dv.expression?.reference) {
          // This might reference a Library resource
          await this.processCanonicalReference(dv.expression.reference);
        }
      }
    }
  }

  private async processCanonicalReference(reference: string): Promise<void> {
    if (this.processedResources.has(reference)) {
      return; // Already processed
    }

    this.processedResources.add(reference);

    try {
      // Check if this is a generated canonical URL (from a previous export)
      // Format: http://medplum.com/fhir/ResourceType/identifier-value
      if (reference.startsWith('http://medplum.com/fhir/') || reference.startsWith('https://medplum.com/fhir/')) {
        // This is likely a generated URL from a previous export
        // Try to extract the identifier and search by it
        const urlParts = reference.split('/');
        if (urlParts.length >= 5) {
          const resourceType = urlParts[urlParts.length - 2];
          const identifierValue = urlParts[urlParts.length - 1];
          const identifierSystem = `http://medplum.com/fhir/export/${resourceType}`;

          // Try to find the resource by identifier
          await this.processCanonicalReferenceByIdentifier(resourceType, identifierSystem, identifierValue);
          return;
        }
      }

      // Try to parse the reference to determine resource type and ID
      const parsed = this.parseCanonicalReference(reference);
      if (parsed) {
        const { resourceType, id } = parsed;

        if (resourceType === 'ActivityDefinition') {
          const resource = await this.medplum.readResource('ActivityDefinition', id);
          await this.processActivityDefinition(resource);
        } else if (resourceType === 'Questionnaire') {
          const resource = await this.medplum.readResource('Questionnaire', id);
          await this.processQuestionnaire(resource);
        } else if (resourceType === 'PlanDefinition') {
          if (this.options.includeNestedPlanDefinitions) {
            const resource = await this.medplum.readResource('PlanDefinition', id);
            await this.processPlanDefinition(resource);
          }
        } else if (resourceType === 'StructureMap') {
          const resource = await this.medplum.readResource('StructureMap', id);
          await this.processStructureMap(resource);
        } else if (resourceType === 'Library') {
          const resource = await this.medplum.readResource('Library', id);
          await this.processLibrary(resource);
        }
      } else {
        // If parsing failed, try searching by URL
        await this.processCanonicalReferenceByUrl(reference);
      }
    } catch (error: any) {
      // Only warn if it's not a "not found" error - those are expected for generated URLs
      if (error.outcome?.issue?.[0]?.code !== 'not-found') {
        console.warn(`Failed to process canonical reference ${reference}:`, error.message || error);
      } else {
        // Silently skip "not found" errors - these are likely generated URLs from previous exports
        // The resource will be included in the bundle if it exists, but won't break the export if it doesn't
      }
    }
  }

  /**
   * Tries to find a resource by identifier (for generated canonical URLs)
   */
  private async processCanonicalReferenceByIdentifier(
    resourceType: string,
    identifierSystem: string,
    identifierValue: string
  ): Promise<void> {
    try {
      const bundle = await this.medplum.search(
        resourceType as any,
        `identifier=${encodeURIComponent(identifierSystem)}|${encodeURIComponent(identifierValue)}`
      );

      if (bundle.entry && bundle.entry.length > 0) {
        const resource = bundle.entry[0].resource;
        if (resource) {
          if (resourceType === 'Questionnaire') {
            await this.processQuestionnaire(resource as any);
          } else if (resourceType === 'ActivityDefinition') {
            await this.processActivityDefinition(resource as any);
          } else if (resourceType === 'PlanDefinition' && this.options.includeNestedPlanDefinitions) {
            await this.processPlanDefinition(resource as any);
          } else if (resourceType === 'StructureMap') {
            await this.processStructureMap(resource as any);
          } else if (resourceType === 'Library') {
            await this.processLibrary(resource as any);
          }
        }
      }
    } catch (error) {
      // Resource not found by identifier - this is okay, it might not exist
      // The reference will be preserved in the bundle as-is
    }
  }

  private async processCanonicalReferenceByUrl(url: string): Promise<void> {
    // Skip generated URLs - they won't exist in the source project
    if (url.startsWith('http://medplum.com/fhir/') || url.startsWith('https://medplum.com/fhir/')) {
      // This is a generated URL from a previous export - skip it
      // The resource will be preserved in the bundle with its generated URL
      return;
    }

    // Try to find the resource by URL search
    // This handles canonical URLs that don't have explicit resource type/ID format
    const resourceTypes: ResourceType[] = [
      'Questionnaire',
      'ActivityDefinition',
      'PlanDefinition',
      'StructureMap',
      'Library',
    ];

    for (const resourceType of resourceTypes) {
      try {
        const bundle = await this.medplum.search(resourceType, `url=${encodeURIComponent(url)}`);
        if (bundle.entry && bundle.entry.length > 0) {
          const resource = bundle.entry[0].resource;
          if (resource) {
            if (resourceType === 'Questionnaire') {
              await this.processQuestionnaire(resource as Questionnaire);
            } else if (resourceType === 'ActivityDefinition') {
              await this.processActivityDefinition(resource as ActivityDefinition);
            } else if (resourceType === 'PlanDefinition' && this.options.includeNestedPlanDefinitions) {
              await this.processPlanDefinition(resource as PlanDefinition);
            } else if (resourceType === 'StructureMap') {
              await this.processStructureMap(resource as StructureMap);
            } else if (resourceType === 'Library') {
              await this.processLibrary(resource as Library);
            }
            return; // Found it, stop searching
          }
        }
      } catch (error) {
        // Continue to next resource type
      }
    }

    // Don't warn for generated URLs - they're expected to not exist
    if (!url.startsWith('http://medplum.com/fhir/') && !url.startsWith('https://medplum.com/fhir/')) {
      console.warn(`Could not resolve canonical reference by URL: ${url}`);
    }
  }

  private async processLibraryReference(libraryRef: string): Promise<void> {
    await this.processCanonicalReference(libraryRef);
  }

  private async processActivityDefinition(activityDefinition: ActivityDefinition): Promise<void> {
    const originalRef = `ActivityDefinition/${activityDefinition.id}`;
    if (this.resourceMap.has(originalRef)) {
      return; // Already processed
    }

    const internalRef = this.generateInternalReference('ActivityDefinition');
    this.resourceMap.set(originalRef, internalRef);
    this.internalRefToResource.set(internalRef, activityDefinition);

    // Ensure canonical URL and identifier before transformation
    this.ensureCanonicalUrl(activityDefinition);
    this.ensureIdentifier(activityDefinition);

    // Process any references within the ActivityDefinition
    await this.processReferencesInResource(activityDefinition);

    // Transform references and add to bundle
    const transformed = this.transformReferences(activityDefinition);
    this.addToBundleWithInternalReference(transformed, internalRef);
  }

  private async processQuestionnaire(questionnaire: Questionnaire): Promise<void> {
    const originalRef = `Questionnaire/${questionnaire.id}`;
    if (this.resourceMap.has(originalRef)) {
      return; // Already processed
    }

    const internalRef = this.generateInternalReference('Questionnaire');
    this.resourceMap.set(originalRef, internalRef);
    this.internalRefToResource.set(internalRef, questionnaire);

    // Ensure canonical URL and identifier before transformation
    this.ensureCanonicalUrl(questionnaire);
    this.ensureIdentifier(questionnaire);

    // Process any references within the Questionnaire
    await this.processReferencesInResource(questionnaire);

    // Transform references and add to bundle
    const transformed = this.transformReferences(questionnaire);
    this.addToBundleWithInternalReference(transformed, internalRef);
  }

  private async processStructureMap(structureMap: StructureMap): Promise<void> {
    const originalRef = `StructureMap/${structureMap.id}`;
    if (this.resourceMap.has(originalRef)) {
      return; // Already processed
    }

    const internalRef = this.generateInternalReference('StructureMap');
    this.resourceMap.set(originalRef, internalRef);
    this.internalRefToResource.set(internalRef, structureMap);

    // Ensure canonical URL and identifier before transformation
    this.ensureCanonicalUrl(structureMap);
    this.ensureIdentifier(structureMap);

    // Process any references within the StructureMap
    await this.processReferencesInResource(structureMap);

    // Transform references and add to bundle
    const transformed = this.transformReferences(structureMap);
    this.addToBundleWithInternalReference(transformed, internalRef);
  }

  private async processLibrary(library: Library): Promise<void> {
    const originalRef = `Library/${library.id}`;
    if (this.resourceMap.has(originalRef)) {
      return; // Already processed
    }

    const internalRef = this.generateInternalReference('Library');
    this.resourceMap.set(originalRef, internalRef);
    this.internalRefToResource.set(internalRef, library);

    // Ensure canonical URL and identifier before transformation
    this.ensureCanonicalUrl(library);
    this.ensureIdentifier(library);

    // Process any references within the Library
    await this.processReferencesInResource(library);

    // Transform references and add to bundle
    const transformed = this.transformReferences(library);
    this.addToBundleWithInternalReference(transformed, internalRef);
  }

  /**
   * Recursively processes all references in a resource
   * @param resource - The resource to process references in
   */
  private async processReferencesInResource(resource: Resource): Promise<void> {
    // Recursively find all references in the resource
    const references = this.extractReferences(resource);
    for (const ref of references) {
      await this.processReference(ref);
    }
  }

  /**
   * Extracts all Reference objects from a resource recursively
   * @param obj - The object to extract references from
   * @param references - Accumulated array of references (for recursion)
   * @returns Array of all Reference objects found
   */
  private extractReferences(obj: any, references: Reference[] = []): Reference[] {
    if (typeof obj !== 'object' || obj === null) {
      return references;
    }

    if (isReference(obj)) {
      references.push(obj);
      return references;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.extractReferences(item, references);
      }
    } else {
      for (const value of Object.values(obj)) {
        this.extractReferences(value, references);
      }
    }

    return references;
  }

  /**
   * Processes a standard FHIR reference
   * @param reference - The reference to process
   */
  private async processReference(reference: Reference): Promise<void> {
    if (!reference.reference) {
      return;
    }

    const refString = reference.reference;

    // Skip if already processed
    if (this.processedResources.has(refString)) {
      return;
    }

    // Skip external references (URLs, not resource/id format)
    if (!refString.includes('/') || refString.startsWith('http://') || refString.startsWith('https://')) {
      // Check if it's a canonical URL that we can resolve
      if (refString.includes('/Questionnaire/') || refString.includes('/ActivityDefinition/')) {
        await this.processCanonicalReference(refString);
      }
      return;
    }

    this.processedResources.add(refString);

    try {
      const [resourceType, id] = refString.split('/') as [ResourceType, string];

      // Only process certain resource types that are commonly referenced
      // and are safe to include (not Patient, Practitioner, etc. which are context-specific)
      const allowedTypes: ResourceType[] = [
        'Questionnaire',
        'ActivityDefinition',
        'PlanDefinition',
        'StructureMap',
        'Library',
        'ValueSet',
        'CodeSystem',
        'ConceptMap',
      ];

      if (allowedTypes.includes(resourceType)) {
        const resource = await this.medplum.readResource(resourceType, id);
        const originalRef = `${resourceType}/${resource.id}`;

        if (!this.resourceMap.has(originalRef)) {
          const internalRef = this.generateInternalReference(resourceType);
          this.resourceMap.set(originalRef, internalRef);
          this.internalRefToResource.set(internalRef, resource);

          // Ensure canonical URL and identifier before transformation
          this.ensureCanonicalUrl(resource);
          this.ensureIdentifier(resource);

          // Process nested references
          await this.processReferencesInResource(resource);

          // Transform and add to bundle
          const transformed = this.transformReferences(resource);
          this.addToBundleWithInternalReference(transformed, internalRef);
        }
      }
    } catch (error) {
      console.warn(`Failed to process reference ${refString}:`, error);
    }
  }

  private parseCanonicalReference(reference: string): { resourceType: string; id: string } | null {
    // Handle canonical references in various formats:
    // - Questionnaire/c86c1fd4-1cd2-416a-aa4f-486e0e2191b5
    // - http://example.com/Questionnaire/c86c1fd4-1cd2-416a-aa4f-486e0e2191b5
    // - http://example.com/fhir/Questionnaire/c86c1fd4-1cd2-416a-aa4f-486e0e2191b5

    // Try to find resource type and ID in the reference
    const parts = reference.split('/');
    if (parts.length >= 2) {
      // Look for resource type and ID in the last two parts
      const resourceType = parts[parts.length - 2];
      const id = parts[parts.length - 1];

      // Validate that it looks like a resource type and ID
      // Resource types are typically PascalCase, and IDs are typically UUIDs or alphanumeric
      if (resourceType && id && /^[a-zA-Z]+$/.test(resourceType) && id.length > 0) {
        return { resourceType, id };
      }
    }

    // Return null if we can't parse it - caller will try URL search
    return null;
  }

  private generateInternalReference(resourceType: string): string {
    // Generate a unique internal reference ID
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${resourceType}-${timestamp}-${random}`;
  }

  private transformReferences(resource: Resource): Resource {
    const transformed = JSON.parse(JSON.stringify(resource)); // Deep clone

    // Clean metadata if requested
    if (this.options.cleanMetadata && transformed.meta) {
      delete transformed.meta.author;
      delete transformed.meta.compartment;
      delete transformed.meta.lastUpdated;
      delete transformed.meta.project;
      delete transformed.meta.versionId;
      if (Object.keys(transformed.meta).length === 0) {
        delete transformed.meta;
      }
    }

    // Remove the original ID since we're creating new resources
    delete transformed.id;

    // Note: ensureIdentifier and ensureCanonicalUrl should be called BEFORE transformReferences
    // They are called on the original resource in the process methods above
    // The URL and identifier will be preserved in the transformed resource

    // Transform references recursively
    this.transformReferencesRecursively(transformed);

    return transformed;
  }

  /**
   * Ensures a resource has a stable identifier for conditional PUT operations
   */
  private ensureIdentifier(resource: Resource): void {
    // If resource already has identifiers, keep them
    if (resource.identifier && resource.identifier.length > 0) {
      return;
    }

    // Generate a stable identifier based on the resource type and a deterministic ID
    // Use the original resource ID if we have it, otherwise generate from the internal ref
    const originalRef = this.findOriginalReference(resource);
    if (originalRef) {
      const system = `http://medplum.com/fhir/export/${resource.resourceType}`;
      const value = originalRef.split('/')[1] || this.generateStableId(resource);
      resource.identifier = [{ system, value }];
    } else {
      // Fallback: generate a stable identifier
      const system = `http://medplum.com/fhir/export/${resource.resourceType}`;
      const value = this.generateStableId(resource);
      resource.identifier = [{ system, value }];
    }
  }

  /**
   * Ensures a resource has a canonical URL for definitionCanonical references
   */
  private ensureCanonicalUrl(resource: Resource): void {
    // If resource already has a URL, keep it (this is the preferred case)
    if ('url' in resource && resource.url) {
      return;
    }

    // Generate a canonical URL based on the identifier
    // This creates a stable URL that can be used in definitionCanonical
    if (resource.identifier && resource.identifier.length > 0) {
      const identifier = resource.identifier[0];
      // Create a stable canonical URL using the identifier
      // Format: http://medplum.com/fhir/ResourceType/identifier-value
      resource.url = `http://medplum.com/fhir/${resource.resourceType}/${identifier.value}`;
    } else {
      // Fallback: generate a URL from resource name or title
      const name =
        ('name' in resource && resource.name) || ('title' in resource && resource.title) || resource.resourceType;
      const urlSafeName = name
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
      resource.url = `http://medplum.com/fhir/${resource.resourceType}/${urlSafeName}`;
    }
  }

  /**
   * Finds the original reference for a resource in our resource map
   * Uses the internalRefToResource map to find the matching original reference
   */
  private findOriginalReference(resource: Resource): string | null {
    // Find which internalRef corresponds to this resource
    for (const [internalRef, mappedResource] of this.internalRefToResource.entries()) {
      // Compare by resource type and ID (if available)
      if (mappedResource.resourceType === resource.resourceType) {
        // Try to match by ID if both have it
        if (mappedResource.id && 'id' in resource && resource.id === mappedResource.id) {
          // Find the original reference for this internal ref
          for (const [originalRef, refInternalRef] of this.resourceMap.entries()) {
            if (refInternalRef === internalRef) {
              return originalRef;
            }
          }
        }
        // If no ID match, try to match by name/title for deterministic matching
        const mappedName =
          ('name' in mappedResource && mappedResource.name) || ('title' in mappedResource && mappedResource.title);
        const resourceName = ('name' in resource && resource.name) || ('title' in resource && resource.title);
        if (mappedName && resourceName && mappedName === resourceName) {
          for (const [originalRef, refInternalRef] of this.resourceMap.entries()) {
            if (refInternalRef === internalRef) {
              return originalRef;
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Generates a stable ID for a resource based on its content
   */
  private generateStableId(resource: Resource): string {
    // Use name or title to create a deterministic ID
    const name =
      ('name' in resource && resource.name) || ('title' in resource && resource.title) || resource.resourceType;
    const nameStr = name
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    // Create a hash-like string from the name
    let hash = 0;
    for (let i = 0; i < nameStr.length; i++) {
      const char = nameStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private transformReferencesRecursively(obj: any): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (key === 'definitionCanonical' || key === 'transform') {
        // For definitionCanonical in Medplum, we need Resource references like "Questionnaire/123"
        // We'll use urn:uuid in the bundle, then resolve to actual IDs after import
        if (typeof value === 'string') {
          const mappedReference = this.findMappedReference(value);
          if (mappedReference) {
            obj[key] = `urn:uuid:${mappedReference}`;
          }
        }
      } else if (key === 'definitionUri') {
        // definitionUri can stay as-is or be transformed to urn:uuid
        if (typeof value === 'string') {
          const mappedReference = this.findMappedReference(value);
          if (mappedReference) {
            obj[key] = `urn:uuid:${mappedReference}`;
          }
        }
      } else if (key === 'reference' && typeof value === 'string') {
        // Handle standard FHIR references - use urn:uuid for bundle-internal references
        const mappedReference = this.findMappedReference(value);
        if (mappedReference) {
          obj[key] = `urn:uuid:${mappedReference}`;
        }
      } else if (key === 'resource' && typeof value === 'string') {
        // Handle relatedArtifact.resource canonical references
        const mappedReference = this.findMappedReference(value);
        if (mappedReference) {
          obj[key] = `urn:uuid:${mappedReference}`;
        }
      } else if (key === 'library' && Array.isArray(value)) {
        // Handle library array - use urn:uuid
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === 'string') {
            const mappedReference = this.findMappedReference(value[i]);
            if (mappedReference) {
              value[i] = `urn:uuid:${mappedReference}`;
            }
          }
        }
      } else if (Array.isArray(value)) {
        value.forEach((item) => this.transformReferencesRecursively(item));
      } else if (typeof value === 'object') {
        this.transformReferencesRecursively(value);
      }
    }
  }

  private findMappedReference(reference: string): string | null {
    // Try exact match first
    const exactMatch = this.resourceMap.get(reference);
    if (exactMatch) {
      return exactMatch;
    }

    // Try to find by resource type/id pattern
    for (const [originalRef, internalRef] of this.resourceMap.entries()) {
      if (reference.endsWith(originalRef) || originalRef.endsWith(reference)) {
        return internalRef;
      }

      // Try matching canonical URL format
      if (reference.includes('/') && originalRef.includes('/')) {
        const refParts = reference.split('/');
        const origParts = originalRef.split('/');
        if (refParts.length >= 2 && origParts.length >= 2) {
          const refId = refParts[refParts.length - 1];
          const origId = origParts[origParts.length - 1];
          if (refId === origId) {
            return internalRef;
          }
        }
      }
    }

    return null;
  }

  private addToBundleWithInternalReference(resource: Resource, internalRef: string): void {
    // Use conditional PUT with identifier for idempotency
    let requestUrl = resource.resourceType;
    const fullUrl = `urn:uuid:${internalRef}`;

    if (resource.identifier && resource.identifier.length > 0) {
      const identifier = resource.identifier[0];
      // Use conditional PUT to allow idempotent imports
      requestUrl = `${resource.resourceType}?identifier=${encodeURIComponent(identifier.system)}|${encodeURIComponent(identifier.value)}`;

      // Store the mapping for post-import resolution
      this.fullUrlToIdentifier.set(fullUrl, {
        resourceType: resource.resourceType,
        identifier: { system: identifier.system, value: identifier.value },
      });
    }

    this.bundleEntries.push({
      fullUrl,
      resource: resource,
      request: {
        method: 'PUT',
        url: requestUrl,
      },
    });
  }

  private splitIntoBundles(): Bundle[] {
    const bundles: Bundle[] = [];
    const maxEntries = this.options.maxEntriesPerBundle;

    for (let i = 0; i < this.bundleEntries.length; i += maxEntries) {
      const entries = this.bundleEntries.slice(i, i + maxEntries);
      bundles.push({
        resourceType: 'Bundle',
        type: 'transaction',
        entry: entries,
      });
    }

    return bundles;
  }
}

/**
 * Resolves definitionCanonical references in a PlanDefinition after bundle import
 * @param medplum - The Medplum client instance
 * @param bundleResponse - The response bundle from importing the exported bundle
 * @param planDefinition - The PlanDefinition that needs its references resolved
 * @param fullUrlToIdentifier - Mapping from fullUrl to identifier for resolution
 * @returns The PlanDefinition with resolved definitionCanonical references
 */
export async function resolvePlanDefinitionReferences(
  medplum: MedplumClient,
  bundleResponse: Bundle,
  planDefinition: PlanDefinition,
  fullUrlToIdentifier: Map<string, { resourceType: string; identifier: { system: string; value: string } }>
): Promise<PlanDefinition> {
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
              const entry = bundleResponse.entry?.find((e) => e.fullUrl === ref);
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
 * Main export function
 * @param medplum - The Medplum client instance
 * @param planDefinitionId - The ID of the PlanDefinition to export
 * @param options - Optional export configuration
 * @returns Export result containing bundles and resource mapping
 */
export async function exportPlanDefinitionWithReferences(
  medplum: MedplumClient,
  planDefinitionId: string,
  options?: ExportOptions
): Promise<ExportResult> {
  const exporter = new PlanDefinitionExporter(medplum, options);
  return exporter.exportPlanDefinition(planDefinitionId);
}

/**
 * CLI entry point
 * @returns Promise that resolves when the export is complete
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node scripts/export-plan-definition.js <planDefinitionId> [outputFile]');
    console.error('');
    console.error('Environment variables (source project):');
    console.error('  MEDPLUM_SOURCE_BASE_URL - Medplum server base URL (default: https://api.medplum.com/)');
    console.error('  MEDPLUM_SOURCE_CLIENT_ID - OAuth client ID for source project');
    console.error('  MEDPLUM_SOURCE_CLIENT_SECRET - OAuth client secret for source project');
    console.error('');
    console.error('Legacy variables (also supported):');
    console.error('  MEDPLUM_BASE_URL, MEDPLUM_CLIENT_ID, MEDPLUM_CLIENT_SECRET');
    console.error('');
    console.error('You can create a .env file in the project root with these variables.');
    process.exit(1);
  }

  const planDefinitionId = args[0];
  const outputFile = args[1] || `plan-definition-export-${planDefinitionId}.json`;

  // Use source project credentials (for export)
  const baseUrl = process.env.MEDPLUM_SOURCE_BASE_URL || process.env.MEDPLUM_BASE_URL || 'https://api.medplum.com/';
  const clientId = process.env.MEDPLUM_SOURCE_CLIENT_ID || process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_SOURCE_CLIENT_SECRET || process.env.MEDPLUM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Error: Source project credentials are required');
    console.error('  Set MEDPLUM_SOURCE_CLIENT_ID and MEDPLUM_SOURCE_CLIENT_SECRET');
    console.error('  Or use legacy: MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET');
    console.error('');
    console.error('You can create a .env file in the project root with:');
    console.error('  MEDPLUM_SOURCE_BASE_URL=https://api.medplum.com/');
    console.error('  MEDPLUM_SOURCE_CLIENT_ID=your-source-client-id');
    console.error('  MEDPLUM_SOURCE_CLIENT_SECRET=your-source-client-secret');
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
      console.error('  Make sure you have valid credentials for the project containing the PlanDefinition.');
      process.exit(1);
    }

    console.log(`Exporting PlanDefinition ${planDefinitionId}...`);

    // Try to read the PlanDefinition first to provide better error messages
    try {
      await medplum.readResource('PlanDefinition', planDefinitionId);
    } catch (readError: any) {
      if (readError.outcome?.issue?.[0]?.code === 'not-found' || readError.message?.includes('Not found')) {
        console.error(`✗ PlanDefinition with ID "${planDefinitionId}" was not found.`);
        console.error('');
        console.error('Possible reasons:');
        console.error('  1. The PlanDefinition ID is incorrect');
        console.error('  2. The PlanDefinition exists in a different project');
        console.error("  3. You don't have permission to access this PlanDefinition");
        console.error('');
        console.error('To find PlanDefinitions, you can search using:');
        console.error(`  medplum search PlanDefinition`);
        console.error(`  Or use the API: GET ${baseUrl}fhir/R4/PlanDefinition`);
        process.exit(1);
      }
      throw readError;
    }

    const result = await exportPlanDefinitionWithReferences(medplum, planDefinitionId);

    console.log(`✓ Export completed successfully!`);
    console.log(`  Total resources: ${result.resourceCount}`);
    console.log(`  Bundles created: ${result.bundles.length}`);

    if (result.bundles.length === 1) {
      // Single bundle - write as single file
      writeFileSync(outputFile, JSON.stringify(result.bundles[0], null, 2));
      console.log(`  Bundle written to: ${outputFile}`);

      // Also write the identifier mapping for post-import resolution
      const mappingFile = outputFile.replace('.json', '-mapping.json');
      const mappingData = {
        fullUrlToIdentifier: Object.fromEntries(result.fullUrlToIdentifier),
        note: 'This file contains the mapping from fullUrl to identifier for resolving definitionCanonical references after import',
      };
      writeFileSync(mappingFile, JSON.stringify(mappingData, null, 2));
      console.log(`  Identifier mapping written to: ${mappingFile}`);
    } else {
      // Multiple bundles - write as separate files
      for (let i = 0; i < result.bundles.length; i++) {
        const bundleFile = outputFile.replace('.json', `-part${i + 1}.json`);
        writeFileSync(bundleFile, JSON.stringify(result.bundles[i], null, 2));
        console.log(`  Bundle ${i + 1} written to: ${bundleFile}`);
      }

      // Write the identifier mapping once for all bundles
      const mappingFile = outputFile.replace('.json', '-mapping.json');
      const mappingData = {
        fullUrlToIdentifier: Object.fromEntries(result.fullUrlToIdentifier),
        note: 'This file contains the mapping from fullUrl to identifier for resolving definitionCanonical references after import',
      };
      writeFileSync(mappingFile, JSON.stringify(mappingData, null, 2));
      console.log(`  Identifier mapping written to: ${mappingFile}`);
    }

    console.log('');
    console.log('To import into another Medplum project:');
    console.log('  1. Import the bundle(s): POST to /fhir/R4/ or use: medplum batch <bundle-file>');
    console.log('  2. After import, use resolvePlanDefinitionReferences() to update definitionCanonical');
    console.log('     references from urn:uuid: to Resource references like Questionnaire/123');
    console.log('  3. Update the PlanDefinition with the resolved references');
  } catch (error: any) {
    console.error('✗ Export failed');

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
    console.error('  1. Verify the PlanDefinition ID is correct');
    console.error('  2. Check that your credentials have access to the project');
    console.error('  3. Ensure the PlanDefinition exists in the project');
    console.error(`  4. Try searching: GET ${baseUrl}fhir/R4/PlanDefinition`);

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
      return (
        currentFile === mainFile ||
        currentFile.replace(/\.ts$/, '.js') === mainFile ||
        pathToFileURL(mainFile).href === import.meta.url
      );
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
