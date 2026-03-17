// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { findAllReferences, findConnectedComponents, redirectReferences } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Binary, Bundle, BundleEntry, Identifier, Resource } from '@medplum/fhirtypes';
import { generateId } from '@medplum/core';

/**
 * Resource types that represent "humans" - these are ingested first and referenced via conditional references.
 */
const HUMAN_RESOURCE_TYPES = new Set(['Patient', 'Practitioner', 'PractitionerRole', 'RelatedPerson']);

/**
 * The system URI used for storing original IDs as identifiers.
 */
const ORIGINAL_ID_SYSTEM = 'urn:medplum:original-id';

/**
 * Maximum bundle size in bytes for async batch requests (30 MB).
 */
const MAX_BUNDLE_SIZE_BYTES = 30 * 1024 * 1024;

/**
 * Initial backoff delay in milliseconds for 429 retry.
 */
const INITIAL_BACKOFF_MS = 2000;

/**
 * Maximum number of retries for 429 rate limiting.
 */
const MAX_RETRIES = 10;

/**
 * Bot handler that ingests a large FHIR bundle (stored as a Binary resource) into Medplum
 * by splitting it into a series of async batch requests.
 *
 * The bundle is processed in phases:
 * 1. Ingest Patient and Practitioner resources first (with conditional create using identifiers).
 * 2. Group remaining resources into connected components to keep related resources together.
 * 3. Co-locate Binary resources with the resources that reference them.
 * 4. Split into batches respecting the 30 MB size limit.
 * 5. Submit each batch as an async batch request with exponential backoff for rate limiting.
 *
 * @param medplum - The MedplumClient instance.
 * @param event - The BotEvent with a Binary resource reference as input.
 * @returns Summary of ingestion results.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // The input is a reference to a Binary resource containing the FHIR bundle
  const binaryRef = event.input as Binary;
  if (!binaryRef?.id) {
    throw new Error('Expected a Binary resource as input');
  }

  console.log(`Downloading bundle from Binary/${binaryRef.id}...`);
  const blob = await medplum.download(`Binary/${binaryRef.id}`);
  const bundleText = await blob.text();
  const bundle = JSON.parse(bundleText) as Bundle;

  if (!bundle.entry?.length) {
    console.log('Bundle has no entries, nothing to do.');
    return { status: 'empty', batchCount: 0, resourceCount: 0 };
  }

  console.log(`Processing bundle with ${bundle.entry.length} entries...`);

  // Phase 1: Separate human resources from the rest
  const humanEntries: BundleEntry[] = [];
  const binaryEntries: BundleEntry[] = [];
  const otherEntries: BundleEntry[] = [];

  for (const entry of bundle.entry) {
    const resource = entry.resource;
    if (!resource) {
      continue;
    }
    if (HUMAN_RESOURCE_TYPES.has(resource.resourceType)) {
      humanEntries.push(entry);
    } else if (resource.resourceType === 'Binary') {
      binaryEntries.push(entry);
    } else {
      otherEntries.push(entry);
    }
  }

  console.log(
    `Separated: ${humanEntries.length} human resources, ${binaryEntries.length} binaries, ${otherEntries.length} other resources`
  );

  // Build a map from original references to conditional references for human resources
  const conditionalRefMap = new Map<string, string>();
  // Also track original ID -> fullUrl for urn:uuid mapping
  const originalIdToFullUrl = new Map<string, string>();

  // Prepare human resource entries for conditional create
  const humanBatchEntries = prepareHumanEntries(humanEntries, conditionalRefMap, originalIdToFullUrl);

  // Phase 2: Prepare other entries - move IDs to identifiers and assign fullUrls
  const preparedOtherEntries = prepareResourceEntries(otherEntries, originalIdToFullUrl);

  // Phase 3: Co-locate binaries with the resources that reference them
  const binaryFullUrlMap = new Map<string, BundleEntry>();
  for (const entry of binaryEntries) {
    const resource = entry.resource;
    if (!resource) {
      continue;
    }
    const originalId = resource.id;
    const uuid = generateId();
    const fullUrl = `urn:uuid:${uuid}`;

    // Move original ID to identifier if the resource supports it
    moveIdToIdentifier(resource);
    resource.id = undefined;

    if (originalId) {
      originalIdToFullUrl.set(originalId, fullUrl);
      binaryFullUrlMap.set(`Binary/${originalId}`, { ...entry, fullUrl, resource });
    } else {
      binaryFullUrlMap.set(fullUrl, { ...entry, fullUrl, resource });
    }
  }

  // Find which resources reference binaries and co-locate them
  const binaryToReferencer = new Map<string, string>(); // binary ref -> referencing resource fullUrl
  for (const entry of preparedOtherEntries) {
    if (!entry.resource) {
      continue;
    }
    findAllReferences(entry.resource, (reference: string) => {
      if (reference.startsWith('Binary/') || binaryFullUrlMap.has(reference)) {
        binaryToReferencer.set(reference, entry.fullUrl as string);
      }
    });
  }

  // Set securityContext on binaries pointing to the resource that references them
  const preparedBinaryEntries: BundleEntry[] = [];
  binaryFullUrlMap.forEach((binaryEntry, binaryRef) => {
    const referencerFullUrl = binaryToReferencer.get(binaryRef);
    if (referencerFullUrl && binaryEntry.resource) {
      (binaryEntry.resource as Binary).securityContext = { reference: referencerFullUrl };
    }
    preparedBinaryEntries.push(binaryEntry);
  });

  // Combine other entries + binary entries for component analysis
  const allNonHumanEntries = [...preparedOtherEntries, ...preparedBinaryEntries];

  // Redirect all references to human resources to use conditional references
  // Also redirect old "Type/id" references to urn:uuid references for non-human resources
  const fullRedirectMap = buildRedirectMap(conditionalRefMap, originalIdToFullUrl, allNonHumanEntries);

  for (const entry of allNonHumanEntries) {
    if (entry.resource) {
      redirectReferences(entry.resource, fullRedirectMap);
    }
  }

  // Phase 4: Find connected components among non-human resources
  const components = findConnectedComponents(allNonHumanEntries, HUMAN_RESOURCE_TYPES);
  console.log(`Found ${components.length} connected components`);

  // Phase 5: Build batches respecting size limits
  const allBatches: Bundle[] = [];

  // First batch: human resources (conditional creates)
  if (humanBatchEntries.length > 0) {
    const humanBatches = splitIntoBatches(humanBatchEntries, MAX_BUNDLE_SIZE_BYTES);
    allBatches.push(...humanBatches);
    console.log(`Human resources split into ${humanBatches.length} batch(es)`);
  }

  // Remaining batches: connected components, packed into batches respecting size limit
  const componentBatches = packComponentsIntoBatches(components, MAX_BUNDLE_SIZE_BYTES);
  allBatches.push(...componentBatches);
  console.log(`Other resources split into ${componentBatches.length} batch(es)`);

  console.log(`Total batches to submit: ${allBatches.length}`);

  // Phase 6: Submit batches as async batch requests with retry logic
  const results: BatchResult[] = [];
  for (let i = 0; i < allBatches.length; i++) {
    const batch = allBatches[i];
    const entryCount = batch.entry?.length ?? 0;
    console.log(`Submitting batch ${i + 1}/${allBatches.length} (${entryCount} entries)...`);

    const result = await submitAsyncBatchWithRetry(medplum, batch);
    results.push(result);

    console.log(`Batch ${i + 1} ${result.status}: ${result.message}`);
  }

  const summary = {
    status: 'complete',
    totalResources: bundle.entry.length,
    batchCount: allBatches.length,
    results,
  };

  console.log(`Ingestion complete: ${summary.batchCount} batches submitted`);
  return summary;
}

interface BatchResult {
  batchIndex: number;
  status: 'success' | 'error';
  message: string;
}

/**
 * Prepares human resource entries for conditional create.
 * Moves original IDs to identifiers, builds conditional reference map.
 */
function prepareHumanEntries(
  entries: BundleEntry[],
  conditionalRefMap: Map<string, string>,
  originalIdToFullUrl: Map<string, string>
): BundleEntry[] {
  const result: BundleEntry[] = [];

  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource) {
      continue;
    }

    const originalId = resource.id;
    const resourceType = resource.resourceType;

    // Move original ID to identifier
    moveIdToIdentifier(resource);

    // Build the conditional reference using the identifier
    const identifier = getIdentifierForConditionalRef(resource);
    const ifNoneExist = identifier
      ? `identifier=${encodeURIComponent(identifier.system + '|' + identifier.value)}`
      : `identifier=${encodeURIComponent(ORIGINAL_ID_SYSTEM + '|' + originalId)}`;

    const conditionalRef = identifier
      ? `${resourceType}?identifier=${encodeURIComponent(identifier.system + '|' + identifier.value)}`
      : `${resourceType}?identifier=${encodeURIComponent(ORIGINAL_ID_SYSTEM + '|' + originalId)}`;

    // Map original references to conditional references
    if (originalId) {
      conditionalRefMap.set(`${resourceType}/${originalId}`, conditionalRef);
      originalIdToFullUrl.set(originalId, conditionalRef);
    }

    // Remove the id so Medplum assigns its own
    resource.id = undefined;

    result.push({
      resource,
      request: {
        method: 'POST',
        url: resourceType,
        ifNoneExist,
      },
    });
  }

  return result;
}

/**
 * Prepares non-human, non-binary resource entries.
 * Moves IDs to identifiers, assigns urn:uuid fullUrls, sets up conditional update requests.
 */
function prepareResourceEntries(
  entries: BundleEntry[],
  originalIdToFullUrl: Map<string, string>
): BundleEntry[] {
  const result: BundleEntry[] = [];

  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource) {
      continue;
    }

    const originalId = resource.id;
    const resourceType = resource.resourceType;
    const uuid = generateId();
    const fullUrl = `urn:uuid:${uuid}`;

    // Move original ID to identifier
    moveIdToIdentifier(resource);

    // Build the conditional update URL using the identifier
    const identifier = getIdentifierForConditionalRef(resource);
    const searchString = identifier
      ? `${resourceType}?identifier=${encodeURIComponent(identifier.system + '|' + identifier.value)}`
      : `${resourceType}?identifier=${encodeURIComponent(ORIGINAL_ID_SYSTEM + '|' + originalId)}`;

    if (originalId) {
      originalIdToFullUrl.set(originalId, fullUrl);
    }

    // Remove the id so Medplum assigns its own
    resource.id = undefined;

    result.push({
      fullUrl,
      resource,
      request: {
        method: 'PUT',
        url: searchString,
      },
    });
  }

  return result;
}

/**
 * Moves the resource's original ID into its identifier array using the ORIGINAL_ID_SYSTEM.
 * This preserves the original ID for idempotent matching while letting Medplum assign its own IDs.
 */
function moveIdToIdentifier(resource: Resource): void {
  if (!resource.id) {
    return;
  }

  const identifiable = resource as Resource & { identifier?: Identifier[] };
  if (!identifiable.identifier) {
    identifiable.identifier = [];
  }

  // Don't add duplicate
  const existing = identifiable.identifier.find(
    (id) => id.system === ORIGINAL_ID_SYSTEM && id.value === resource.id
  );
  if (!existing) {
    identifiable.identifier.push({
      system: ORIGINAL_ID_SYSTEM,
      value: resource.id,
    });
  }
}

/**
 * Gets the best identifier for a conditional reference.
 * Prefers existing identifiers with a system, falls back to the original-id identifier.
 */
function getIdentifierForConditionalRef(resource: Resource): Identifier | undefined {
  const identifiable = resource as Resource & { identifier?: Identifier[] };
  if (!identifiable.identifier?.length) {
    return undefined;
  }

  // Prefer a non-original-id identifier with a system
  const preferred = identifiable.identifier.find(
    (id) => id.system && id.value && id.system !== ORIGINAL_ID_SYSTEM
  );
  if (preferred) {
    return preferred;
  }

  // Fall back to original-id identifier
  return identifiable.identifier.find((id) => id.system === ORIGINAL_ID_SYSTEM && id.value);
}

/**
 * Builds a complete redirect map that maps old "Type/id" references to either
 * conditional references (for humans) or urn:uuid references (for non-humans in the bundle).
 */
function buildRedirectMap(
  conditionalRefMap: Map<string, string>,
  originalIdToFullUrl: Map<string, string>,
  entries: BundleEntry[]
): Map<string, string> {
  const redirectMap = new Map<string, string>(conditionalRefMap);

  // Build a map of fullUrl -> entry for lookup
  const fullUrlSet = new Set<string>();
  for (const entry of entries) {
    if (entry.fullUrl) {
      fullUrlSet.add(entry.fullUrl);
    }
  }

  // For each entry, map "Type/originalId" -> urn:uuid:xxx
  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource || !entry.fullUrl) {
      continue;
    }

    // Find the original ID from the identifier
    const identifiable = resource as Resource & { identifier?: Identifier[] };
    const originalIdIdentifier = identifiable.identifier?.find((id) => id.system === ORIGINAL_ID_SYSTEM);
    if (originalIdIdentifier?.value) {
      const oldRef = `${resource.resourceType}/${originalIdIdentifier.value}`;
      if (!redirectMap.has(oldRef)) {
        redirectMap.set(oldRef, entry.fullUrl);
      }
    }
  }

  return redirectMap;
}

/**
 * Splits a list of bundle entries into batches that each fit within the size limit.
 */
function splitIntoBatches(entries: BundleEntry[], maxSizeBytes: number): Bundle[] {
  const batches: Bundle[] = [];
  let currentEntries: BundleEntry[] = [];
  let currentSize = 0;

  // Overhead for the bundle wrapper JSON
  const bundleOverhead = JSON.stringify({ resourceType: 'Bundle', type: 'batch', entry: [] }).length;

  for (const entry of entries) {
    const entrySize = JSON.stringify(entry).length;

    if (currentEntries.length > 0 && currentSize + entrySize + bundleOverhead > maxSizeBytes) {
      batches.push({
        resourceType: 'Bundle',
        type: 'batch',
        entry: currentEntries,
      });
      currentEntries = [];
      currentSize = 0;
    }

    currentEntries.push(entry);
    currentSize += entrySize;
  }

  if (currentEntries.length > 0) {
    batches.push({
      resourceType: 'Bundle',
      type: 'batch',
      entry: currentEntries,
    });
  }

  return batches;
}

/**
 * Packs connected components into batches, trying to keep entire components together.
 * If a single component exceeds the size limit, it is split across multiple batches.
 */
function packComponentsIntoBatches(components: BundleEntry[][], maxSizeBytes: number): Bundle[] {
  const batches: Bundle[] = [];
  let currentEntries: BundleEntry[] = [];
  let currentSize = 0;

  const bundleOverhead = JSON.stringify({ resourceType: 'Bundle', type: 'batch', entry: [] }).length;

  for (const component of components) {
    const componentSize = component.reduce((sum, entry) => sum + JSON.stringify(entry).length, 0);

    // If adding this component would exceed the limit, flush current batch
    if (currentEntries.length > 0 && currentSize + componentSize + bundleOverhead > maxSizeBytes) {
      batches.push({
        resourceType: 'Bundle',
        type: 'batch',
        entry: currentEntries,
      });
      currentEntries = [];
      currentSize = 0;
    }

    // If the component itself is too large, split it (rare edge case)
    if (componentSize + bundleOverhead > maxSizeBytes) {
      const splitBatches = splitIntoBatches(component, maxSizeBytes);
      batches.push(...splitBatches);
    } else {
      currentEntries.push(...component);
      currentSize += componentSize;
    }
  }

  if (currentEntries.length > 0) {
    batches.push({
      resourceType: 'Bundle',
      type: 'batch',
      entry: currentEntries,
    });
  }

  return batches;
}

/**
 * Submits a bundle as an async batch request with exponential backoff for 429 rate limiting.
 */
async function submitAsyncBatchWithRetry(medplum: MedplumClient, batch: Bundle): Promise<BatchResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await medplum.executeBatch(batch, {
        headers: { Prefer: 'respond-async' },
        pollStatusOnAccepted: true,
        pollStatusPeriod: 2000,
      });

      return {
        batchIndex: 0,
        status: 'success',
        message: `Submitted ${batch.entry?.length ?? 0} entries`,
      };
    } catch (err: any) {
      lastError = err;

      // Check if this is a 429 rate limit error
      const is429 = err?.outcome?.issue?.some(
        (issue: any) => issue.details?.text?.includes('429') || issue.diagnostics?.includes('rate')
      ) || err?.message?.includes('429') || err?.status === 429;

      if (!is429 || attempt === MAX_RETRIES) {
        break;
      }

      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.log(`Rate limited (429). Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      await sleep(backoffMs);
    }
  }

  return {
    batchIndex: 0,
    status: 'error',
    message: lastError?.message ?? 'Unknown error',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
