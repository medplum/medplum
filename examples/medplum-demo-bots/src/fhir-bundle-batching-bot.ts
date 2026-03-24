// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  generateId,
  getIdentifier,
  isReference,
  isResource,
  redirectReferences,
  setIdentifier,
  sleep,
  splitBundleByDependencies,
  stringify,
} from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Binary, Bundle, BundleEntry, Identifier, Reference, Resource } from '@medplum/fhirtypes';

/**
 * Resource types ingested first, following the Medplum migration sequence:
 * 1. Practitioner, PractitionerRole (provider demographics & credentials)
 * 2. Organization (shared organizations)
 * 3. Patient, RelatedPerson (patient demographics)
 *
 * @see https://www.medplum.com/docs/migration/migration-sequence
 */
const PRIORITY_RESOURCE_TYPES = new Set([
  'Practitioner',
  'PractitionerRole',
  'Organization',
  'Patient',
  'RelatedPerson',
]);

/**
 * Ordered phases for priority resource ingestion, matching the migration sequence.
 * Resources within the same phase are batched together.
 */
const PRIORITY_PHASES: string[][] = [
  ['Practitioner', 'PractitionerRole'],
  ['Organization'],
  ['Patient', 'RelatedPerson'],
];

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
 * Bot handler that ingests a large FHIR bundle into Medplum by splitting it into a series of
 * async batch requests.
 *
 * Input can be one of:
 * - A `Bundle` resource (JSON object with resourceType "Bundle")
 * - A `Reference` to a stored `Bundle` resource (e.g., `{ reference: "Bundle/123" }`)
 * - A `Binary` resource or `Reference` to one containing the bundle JSON
 *
 * The second input parameter is the identifier system URI used for storing original IDs.
 * Pass it via `event.secrets['IDENTIFIER_SYSTEM']` or it defaults to `urn:medplum:original-id`.
 *
 * The bundle is processed following the Medplum migration sequence:
 * 1. Ingest Practitioner/PractitionerRole first (provider demographics).
 * 2. Ingest Organization resources (shared organizations).
 * 3. Ingest Patient/RelatedPerson resources (patient demographics).
 * 4. Group remaining resources into connected components to keep related resources together.
 * 5. Co-locate Binary resources with the resources that reference them.
 * 6. Split into batches respecting the 30 MB size limit.
 * 7. Submit each batch as an async batch request with exponential backoff for rate limiting.
 *
 * @param medplum - The MedplumClient instance.
 * @param event - The BotEvent. Input is a Bundle, Reference<Bundle>, Binary, or Reference<Binary>.
 *   The identifier system is taken from `event.secrets['IDENTIFIER_SYSTEM'].value`.
 * @returns Summary of ingestion results.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const identifierSystem = event.secrets['IDENTIFIER_SYSTEM']?.value ?? 'urn:medplum:original-id';

  const bundle = await resolveBundle(medplum, event.input);

  if (!bundle.entry?.length) {
    console.log('Bundle has no entries, nothing to do.');
    return { status: 'empty', batchCount: 0, resourceCount: 0 };
  }

  console.log(`Processing bundle with ${bundle.entry.length} entries (identifier system: ${identifierSystem})...`);

  // Phase 1: Separate priority resources from the rest
  const priorityEntries = new Map<string, BundleEntry[]>();
  const binaryEntries: BundleEntry[] = [];
  const otherEntries: BundleEntry[] = [];

  for (const entry of bundle.entry) {
    const resource = entry.resource;
    if (!resource) {
      continue;
    }
    if (PRIORITY_RESOURCE_TYPES.has(resource.resourceType)) {
      const existing = priorityEntries.get(resource.resourceType) ?? [];
      existing.push(entry);
      priorityEntries.set(resource.resourceType, existing);
    } else if (resource.resourceType === 'Binary') {
      binaryEntries.push(entry);
    } else {
      otherEntries.push(entry);
    }
  }

  const priorityCount = Array.from(priorityEntries.values()).reduce((sum, arr) => sum + arr.length, 0);
  console.log(
    `Separated: ${priorityCount} priority resources, ${binaryEntries.length} binaries, ${otherEntries.length} other resources`
  );

  // Build a map from original references to conditional references for priority resources
  const conditionalRefMap = new Map<string, string>();
  // Also track original ID -> fullUrl for urn:uuid mapping
  const originalIdToFullUrl = new Map<string, string>();

  // Prepare priority resource entries for conditional create, in migration sequence order
  const priorityBatches: BundleEntry[][] = [];
  for (const phaseTypes of PRIORITY_PHASES) {
    const phaseEntries: BundleEntry[] = [];
    for (const resourceType of phaseTypes) {
      const entries = priorityEntries.get(resourceType);
      if (entries) {
        phaseEntries.push(...entries);
      }
    }
    if (phaseEntries.length > 0) {
      const prepared = preparePriorityEntries(phaseEntries, conditionalRefMap, originalIdToFullUrl, identifierSystem);
      priorityBatches.push(prepared);
    }
  }

  // Phase 2: Prepare other entries - move IDs to identifiers and assign fullUrls
  const preparedOtherEntries = prepareResourceEntries(otherEntries, originalIdToFullUrl, identifierSystem);

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

    moveIdToIdentifier(resource, identifierSystem);
    resource.id = undefined;

    if (originalId) {
      originalIdToFullUrl.set(originalId, fullUrl);
      binaryFullUrlMap.set(`Binary/${originalId}`, { ...entry, fullUrl, resource });
    } else {
      binaryFullUrlMap.set(fullUrl, { ...entry, fullUrl, resource });
    }
  }

  // Find which resources reference binaries and co-locate them.
  // Scan all string values (not just FHIR Reference objects) because Binary resources are also
  // referenced via plain URL strings in fields like Attachment.url.
  const binaryKeys = new Set(binaryFullUrlMap.keys());
  const binaryToReferencer = new Map<string, string>(); // binary ref -> referencing resource fullUrl
  for (const entry of preparedOtherEntries) {
    if (!entry.resource || !entry.fullUrl) {
      continue;
    }
    scanStringValues(entry.resource, binaryKeys, (ref: string) => {
      binaryToReferencer.set(ref, entry.fullUrl as string);
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
  const allNonPriorityEntries = [...preparedOtherEntries, ...preparedBinaryEntries];

  // Redirect all references to priority resources to use conditional references
  // Also redirect old "Type/id" references to urn:uuid references for non-priority resources
  const fullRedirectMap = buildRedirectMap(conditionalRefMap, originalIdToFullUrl, allNonPriorityEntries, identifierSystem);

  for (const entry of allNonPriorityEntries) {
    if (entry.resource) {
      redirectReferences(entry.resource, fullRedirectMap);
    }
  }

  // Phase 4: Find connected components among non-priority resources
  // References to priority types have already been rewritten to conditional refs,
  // so splitBundleByDependencies will naturally keep only intra-group edges.
  const components = splitBundleByDependencies({
    resourceType: 'Bundle',
    type: 'collection',
    entry: allNonPriorityEntries,
  });
  console.log(`Found ${components.length} connected components`);

  // Phase 5: Build batches respecting size limits
  const allBatches: Bundle[] = [];

  // Priority batches in migration sequence order
  for (const phaseEntries of priorityBatches) {
    const batches = splitIntoBatches(phaseEntries, MAX_BUNDLE_SIZE_BYTES);
    allBatches.push(...batches);
  }
  if (priorityBatches.length > 0) {
    console.log(`Priority resources split into ${allBatches.length} batch(es)`);
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

    const result = await submitAsyncBatchWithRetry(medplum, batch, i);
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

/**
 * Resolves the bot input into a Bundle, supporting multiple input types:
 * - Bundle JSON object directly
 * - Reference to a stored Bundle resource
 * - Binary resource or Reference to a Binary containing bundle JSON
 * @param medplum - The MedplumClient instance for reading/downloading resources.
 * @param input - The bot input (Bundle, Reference, or Binary).
 * @returns The resolved FHIR Bundle.
 */
async function resolveBundle(medplum: MedplumClient, input: any): Promise<Bundle> {
  // Case 1: Direct Bundle object
  if (isResource(input, 'Bundle')) {
    console.log('Input is a Bundle resource');
    return input;
  }

  // Case 2: Reference object (e.g., { reference: "Bundle/123" } or { reference: "Binary/456" })
  if (isReference(input)) {
    const ref = input.reference;
    if (ref.startsWith('Bundle/')) {
      console.log(`Input is a reference to ${ref}, reading...`);
      return medplum.readReference(input as Reference<Bundle>);
    }
    if (ref.startsWith('Binary/')) {
      console.log(`Input is a reference to ${ref}, downloading...`);
      const blob = await medplum.download(ref);
      const text = await blob.text();
      return JSON.parse(text) as Bundle;
    }
  }

  // Case 3: Binary resource object with an id
  if (isResource(input, 'Binary') && input.id) {
    console.log(`Input is a Binary resource (Binary/${input.id}), downloading...`);
    const blob = await medplum.download(`Binary/${input.id}`);
    const text = await blob.text();
    return JSON.parse(text) as Bundle;
  }

  throw new Error(
    'Unsupported input type. Expected a Bundle resource, a Reference to a Bundle, ' +
      'a Binary resource, or a Reference to a Binary containing bundle JSON.'
  );
}

interface BatchResult {
  batchIndex: number;
  status: 'success' | 'error';
  message: string;
}

/**
 * Prepares priority resource entries for conditional create.
 * Moves original IDs to identifiers, builds conditional reference map.
 * @param entries - The priority bundle entries to prepare.
 * @param conditionalRefMap - Map to populate with original ref to conditional ref mappings.
 * @param originalIdToFullUrl - Map to populate with original ID to fullUrl mappings.
 * @param identifierSystem - The identifier system URI for original IDs.
 * @returns Prepared bundle entries with conditional create request metadata.
 */
function preparePriorityEntries(
  entries: BundleEntry[],
  conditionalRefMap: Map<string, string>,
  originalIdToFullUrl: Map<string, string>,
  identifierSystem: string
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
    moveIdToIdentifier(resource, identifierSystem);

    // Build the conditional reference using the identifier
    const identifier = getIdentifierForConditionalRef(resource, identifierSystem);
    const ifNoneExist = identifier
      ? `identifier=${encodeURIComponent(identifier.system + '|' + identifier.value)}`
      : `identifier=${encodeURIComponent(identifierSystem + '|' + originalId)}`;

    const conditionalRef = identifier
      ? `${resourceType}?identifier=${encodeURIComponent(identifier.system + '|' + identifier.value)}`
      : `${resourceType}?identifier=${encodeURIComponent(identifierSystem + '|' + originalId)}`;

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
 * Prepares non-priority, non-binary resource entries.
 * Moves IDs to identifiers, assigns urn:uuid fullUrls, sets up conditional update requests.
 * @param entries - The non-priority bundle entries to prepare.
 * @param originalIdToFullUrl - Map to populate with original ID to urn:uuid mappings.
 * @param identifierSystem - The identifier system URI for original IDs.
 * @returns Prepared bundle entries with conditional update request metadata.
 */
function prepareResourceEntries(
  entries: BundleEntry[],
  originalIdToFullUrl: Map<string, string>,
  identifierSystem: string
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
    moveIdToIdentifier(resource, identifierSystem);

    // Build the conditional update URL using the identifier
    const identifier = getIdentifierForConditionalRef(resource, identifierSystem);
    const searchString = identifier
      ? `${resourceType}?identifier=${encodeURIComponent(identifier.system + '|' + identifier.value)}`
      : `${resourceType}?identifier=${encodeURIComponent(identifierSystem + '|' + originalId)}`;

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
 * Moves the resource's original ID into its identifier array using the given system URI.
 * This preserves the original ID for idempotent matching while letting Medplum assign its own IDs.
 * @param resource - The FHIR resource whose ID should be moved.
 * @param identifierSystem - The identifier system URI for the original ID.
 */
function moveIdToIdentifier(resource: Resource, identifierSystem: string): void {
  if (!resource.id) {
    return;
  }
  setIdentifier(resource as Resource & { identifier?: Identifier[] }, identifierSystem, resource.id);
}

/**
 * Gets the best identifier for a conditional reference.
 * Prefers existing identifiers with a system, falls back to the original-id identifier.
 * @param resource - The FHIR resource to inspect.
 * @param identifierSystem - The identifier system URI used for original IDs.
 * @returns The best identifier for building a conditional reference, or undefined.
 */
function getIdentifierForConditionalRef(resource: Resource, identifierSystem: string): Identifier | undefined {
  const identifiable = resource as Resource & { identifier?: Identifier[] };
  if (!identifiable.identifier?.length) {
    return undefined;
  }

  // Prefer a non-original-id identifier with a system
  const preferred = identifiable.identifier.find(
    (id) => id.system && id.value && id.system !== identifierSystem
  );
  if (preferred) {
    return preferred;
  }

  // Fall back to original-id identifier
  return identifiable.identifier.find((id) => id.system === identifierSystem && id.value);
}

/**
 * Builds a complete redirect map that maps old "Type/id" references to either
 * conditional references (for priority resources) or urn:uuid references (for non-priority resources).
 * @param conditionalRefMap - Map of priority resource original refs to conditional refs.
 * @param originalIdToFullUrl - Map of original IDs to fullUrl/conditional ref strings.
 * @param entries - The non-priority bundle entries whose references need mapping.
 * @param identifierSystem - The identifier system URI for original IDs.
 * @returns A map from old reference strings to new reference strings.
 */
function buildRedirectMap(
  conditionalRefMap: Map<string, string>,
  originalIdToFullUrl: Map<string, string>,
  entries: BundleEntry[],
  identifierSystem: string
): Map<string, string> {
  const redirectMap = new Map<string, string>(conditionalRefMap);

  // For each entry, map "Type/originalId" -> urn:uuid:xxx
  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource || !entry.fullUrl) {
      continue;
    }

    // Find the original ID from the identifier
    const originalId = getIdentifier(resource, identifierSystem);
    if (originalId) {
      const oldRef = `${resource.resourceType}/${originalId}`;
      if (!redirectMap.has(oldRef)) {
        redirectMap.set(oldRef, entry.fullUrl);
      }
    }
  }

  return redirectMap;
}

/**
 * Recursively walks an object and calls the callback for every string value that
 * is present in the given key set. Used to find Binary resource references that
 * appear as plain URL strings (e.g. Attachment.url) rather than FHIR Reference objects.
 * @param obj - The object to scan recursively.
 * @param keys - The set of string values to match against.
 * @param callback - Called with each matched string value.
 */
function scanStringValues(obj: any, keys: Set<string>, callback: (value: string) => void): void {
  if (!obj || typeof obj !== 'object') {
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      scanStringValues(item, keys, callback);
    }
    return;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      if (keys.has(val)) {
        callback(val);
      }
    } else if (val && typeof val === 'object') {
      scanStringValues(val, keys, callback);
    }
  }
}

/**
 * Splits a list of bundle entries into batches that each fit within the size limit.
 * @param entries - The bundle entries to split.
 * @param maxSizeBytes - Maximum batch size in bytes.
 * @returns An array of batch bundles.
 */
function splitIntoBatches(entries: BundleEntry[], maxSizeBytes: number): Bundle[] {
  const batches: Bundle[] = [];
  let currentEntries: BundleEntry[] = [];
  let currentSize = 0;

  // Overhead for the bundle wrapper JSON
  const bundleOverhead = stringify({ resourceType: 'Bundle', type: 'batch', entry: [] }).length;

  for (const entry of entries) {
    const entrySize = stringify(entry).length;

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
 * @param components - The connected components to pack.
 * @param maxSizeBytes - Maximum batch size in bytes.
 * @returns An array of batch bundles.
 */
function packComponentsIntoBatches(components: BundleEntry[][], maxSizeBytes: number): Bundle[] {
  const batches: Bundle[] = [];
  let currentEntries: BundleEntry[] = [];
  let currentSize = 0;

  const bundleOverhead = stringify({ resourceType: 'Bundle', type: 'batch', entry: [] }).length;

  for (const component of components) {
    const componentSize = component.reduce((sum, entry) => sum + stringify(entry).length, 0);

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
      const splitBundles = splitIntoBatches(component, maxSizeBytes);
      batches.push(...splitBundles);
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
 * @param medplum - The MedplumClient instance.
 * @param batch - The batch bundle to submit.
 * @param batchIndex - The zero-based index of this batch (for result tracking).
 * @returns The result of the batch submission.
 */
async function submitAsyncBatchWithRetry(
  medplum: MedplumClient,
  batch: Bundle,
  batchIndex: number
): Promise<BatchResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await medplum.executeBatch(batch, {
        headers: { Prefer: 'respond-async' },
        pollStatusOnAccepted: true,
        pollStatusPeriod: 2000,
      });

      return {
        batchIndex,
        status: 'success',
        message: `Submitted ${batch.entry?.length ?? 0} entries`,
      };
    } catch (err: any) {
      lastError = err;

      // Check if this is a 429 rate limit error
      const is429 =
        err?.outcome?.issue?.some(
          (issue: any) => issue.details?.text?.includes('429') || issue.diagnostics?.includes('rate')
        ) ||
        err?.message?.includes('429') ||
        err?.status === 429;

      if (!is429 || attempt === MAX_RETRIES) {
        break;
      }

      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.log(`Rate limited (429). Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      await sleep(backoffMs);
    }
  }

  return {
    batchIndex,
    status: 'error',
    message: lastError?.message ?? 'Unknown error',
  };
}

