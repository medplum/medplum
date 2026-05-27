// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { CurrentContext, FhircastAnchorResourceType, FhircastEventPayload, FhircastEventName } from '@medplum/core';
import { generateId, badRequest, OperationOutcomeError, isResource, EMPTY, append } from '@medplum/core';
import type { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';
import { getCacheRedis } from '../redis';
import { getLogger } from '../logger';
import { RedisKeys } from './types';

// Lua script for atomic compare-and-set on context updates.
// KEYS[1] = context key
// ARGV[1] = expected versionId
// ARGV[2] = new context JSON
// Returns: 1 on success, 0 on version mismatch, -1 if no context exists
const COMPARE_AND_SET_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then
  return -1
end
local decoded = cjson.decode(current)
if decoded['context.versionId'] ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;

const RESOURCE_TYPE_LOWER_TO_VALID: Record<string, FhircastAnchorResourceType> = {
  patient: 'Patient',
  imagingstudy: 'ImagingStudy',
  encounter: 'Encounter',
  diagnosticreport: 'DiagnosticReport',
};

/**
 * Extract the anchor resource type from an event name.
 * E.g. "Patient-open" -> "Patient", "DiagnosticReport-update" -> "DiagnosticReport"
 */
export function extractAnchorResourceType(eventName: string): FhircastAnchorResourceType {
  const lowered = eventName.split('-')[0].toLowerCase();
  const resourceType = RESOURCE_TYPE_LOWER_TO_VALID[lowered];
  if (!resourceType) {
    throw new OperationOutcomeError(badRequest(`Invalid anchor resource type in event: ${eventName}`));
  }
  return resourceType;
}

/**
 * Get the current context for a topic.
 */
export async function getCurrentContext(
  projectId: string,
  topic: string
): Promise<CurrentContext<FhircastAnchorResourceType> | undefined> {
  const key = RedisKeys.topicCurrentContext(projectId, topic);
  const value = await getCacheRedis().get(key);
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    getLogger().error('[FHIRcast R4] Failed to parse current context', { projectId, topic });
    return undefined;
  }
}

/**
 * Set the current context for a topic.
 */
export async function setCurrentContext(
  projectId: string,
  topic: string,
  context: CurrentContext<FhircastAnchorResourceType>
): Promise<void> {
  const key = RedisKeys.topicCurrentContext(projectId, topic);
  await getCacheRedis().set(key, JSON.stringify(context));
}

/**
 * Atomically update the current context with compare-and-set.
 * Returns true if the update succeeded, false if version mismatch.
 * Throws if no context exists.
 */
export async function compareAndSetContext(
  projectId: string,
  topic: string,
  expectedVersionId: string,
  newContext: CurrentContext<FhircastAnchorResourceType>
): Promise<boolean> {
  const key = RedisKeys.topicCurrentContext(projectId, topic);
  const result = await getCacheRedis().eval(COMPARE_AND_SET_LUA, 1, key, expectedVersionId, JSON.stringify(newContext));

  if (result === -1) {
    throw new OperationOutcomeError(badRequest('No context currently open for this topic'));
  }
  return result === 1;
}

/**
 * Clear the current context for a topic.
 */
export async function clearCurrentContext(projectId: string, topic: string): Promise<void> {
  const key = RedisKeys.topicCurrentContext(projectId, topic);
  await getCacheRedis().del(key);
}

/**
 * Store a context for later retrieval (DiagnosticReport multi-context).
 */
export async function storeContext(
  projectId: string,
  topic: string,
  resourceId: string,
  context: CurrentContext<FhircastAnchorResourceType>
): Promise<void> {
  const key = RedisKeys.topicContextStorage(projectId, topic);
  await getCacheRedis().hset(key, resourceId, JSON.stringify(context));
}

/**
 * Fetch a stored context by resource ID.
 */
export async function fetchStoredContext(
  projectId: string,
  topic: string,
  resourceId: string
): Promise<CurrentContext<FhircastAnchorResourceType> | undefined> {
  const key = RedisKeys.topicContextStorage(projectId, topic);
  const value = await getCacheRedis().hget(key, resourceId);
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Remove a stored context.
 */
export async function removeStoredContext(projectId: string, topic: string, resourceId: string): Promise<void> {
  const key = RedisKeys.topicContextStorage(projectId, topic);
  await getCacheRedis().hdel(key, resourceId);
}

/**
 * Remove all stored contexts for a topic.
 */
export async function clearStoredContexts(projectId: string, topic: string): Promise<void> {
  const key = RedisKeys.topicContextStorage(projectId, topic);
  await getCacheRedis().del(key);
}

/**
 * Handle an open context change request.
 * Returns the updated event payload with context.versionId set.
 */
export async function handleOpenEvent(
  projectId: string,
  event: FhircastEventPayload
): Promise<void> {
  const topic = event['hub.topic'];
  const anchorResourceType = extractAnchorResourceType(event['hub.event']);

  // If there's a current context that is DiagnosticReport, store it before replacing
  const currentContext = await getCurrentContext(projectId, topic);
  if (currentContext?.['context.type'] === 'DiagnosticReport') {
    const report = currentContext.context.find((ctx) => ctx.key === 'report')?.resource;
    if (isResource(report, 'DiagnosticReport') && report.id) {
      await storeContext(projectId, topic, report.id, currentContext);
    }
  }

  // Check if we have a stored context for a DiagnosticReport being reopened
  if (anchorResourceType === 'DiagnosticReport') {
    const anchorReport = (event.context as Array<{ key: string; resource: Resource }>).find(
      (ctx) => ctx.key === 'report'
    )?.resource;

    if (anchorReport?.id) {
      const storedContext = await fetchStoredContext(projectId, topic, anchorReport.id);
      if (storedContext) {
        await setCurrentContext(projectId, topic, storedContext);
        event['context.versionId'] = storedContext['context.versionId'];
        return;
      }
    }
  }

  // Create new context
  event['context.versionId'] = generateId();

  if (anchorResourceType === 'DiagnosticReport') {
    await setCurrentContext(projectId, topic, {
      'context.type': 'DiagnosticReport',
      context: [
        ...event.context,
        {
          key: 'content',
          resource: { id: generateId(), resourceType: 'Bundle', type: 'collection' },
        },
      ],
      'context.versionId': event['context.versionId'],
    } as CurrentContext<'DiagnosticReport'>);
  } else {
    await setCurrentContext(projectId, topic, {
      'context.type': anchorResourceType,
      context: event.context,
      'context.versionId': event['context.versionId'],
    } as CurrentContext<typeof anchorResourceType>);
  }
}

/**
 * Handle a close context change request.
 */
export async function handleCloseEvent(
  projectId: string,
  event: FhircastEventPayload
): Promise<void> {
  const topic = event['hub.topic'];

  // If closing a DiagnosticReport, clean up its stored context
  const report = (event.context as Array<{ key: string; resource: Resource }>).find(
    (ctx) => ctx.key === 'report'
  )?.resource;

  if (report?.id) {
    await removeStoredContext(projectId, topic, report.id);
  }

  // Clear the current context
  await clearCurrentContext(projectId, topic);
}

/**
 * Handle an update context change request (DiagnosticReport-update).
 * Validates version ID, processes Bundle operations, updates context atomically.
 * Returns the prior version ID on success.
 */
export async function handleUpdateEvent(
  projectId: string,
  event: FhircastEventPayload
): Promise<string> {
  const topic = event['hub.topic'];
  const currentContext = await getCurrentContext(projectId, topic);

  if (!currentContext || currentContext['context.type'] !== 'DiagnosticReport') {
    throw new OperationOutcomeError(badRequest('No DiagnosticReport currently open for this topic'));
  }

  const priorVersionId = currentContext['context.versionId'];

  // Version check
  if (event['context.versionId'] !== priorVersionId) {
    throw new OperationOutcomeError(
      badRequest(
        `Version mismatch: expected '${priorVersionId}', received '${event['context.versionId'] || '(empty)'}'`
      )
    );
  }

  // Extract and validate updates bundle
  const updates = event.context.find(
    (ctx: { key: string; resource?: Resource }) => ctx.key === 'updates'
  )?.resource as Bundle | undefined;

  if (!updates) {
    throw new OperationOutcomeError(badRequest('Update event requires an updates bundle in the context'));
  }

  // Process the update bundle
  processUpdateBundle(updates, currentContext as CurrentContext<'DiagnosticReport'>);

  // Generate new version
  const newVersionId = generateId();
  event['context.priorVersionId'] = priorVersionId;
  currentContext['context.versionId'] = newVersionId;
  event['context.versionId'] = newVersionId;

  // Atomic context update
  const success = await compareAndSetContext(projectId, topic, priorVersionId, currentContext);
  if (!success) {
    throw new OperationOutcomeError(badRequest('Concurrent context modification detected'));
  }

  return priorVersionId;
}

/**
 * Process PUT/DELETE entries in an update bundle against the content bundle.
 */
function processUpdateBundle(updatesBundle: Bundle, currentContext: CurrentContext<'DiagnosticReport'>): void {
  const contentBundle = currentContext.context.find((ctx) => ctx.key === 'content')?.resource as Bundle;

  for (const entry of updatesBundle?.entry ?? EMPTY) {
    switch (entry.request?.method) {
      case 'PUT':
        processUpdateBundlePutEntry(entry, contentBundle);
        break;
      case 'DELETE':
        processUpdateBundleDeleteEntry(entry, contentBundle, currentContext);
        break;
      case undefined:
        throw new OperationOutcomeError(badRequest('Update bundle contains entry with missing request.method'));
      default:
        throw new OperationOutcomeError(
          badRequest(
            `Update bundle contains entry with unsupported request.method '${entry.request?.method}', only 'PUT' and 'DELETE' are supported`
          )
        );
    }
  }
}

function processUpdateBundlePutEntry(entry: BundleEntry, contentBundle: Bundle): void {
  if (!entry.resource) {
    throw new OperationOutcomeError(badRequest('Missing resource in update bundle PUT entry'));
  }

  const upsertedResource = entry.resource;
  const matchingIndex = contentBundle.entry?.findIndex((e) => e.resource?.id === upsertedResource.id);

  if (matchingIndex === undefined || matchingIndex === -1) {
    contentBundle.entry = append(contentBundle.entry, { resource: upsertedResource });
  } else {
    (contentBundle.entry as BundleEntry[])[matchingIndex].resource = upsertedResource;
  }
}

function processUpdateBundleDeleteEntry(
  entry: BundleEntry,
  contentBundle: Bundle,
  currentContext: CurrentContext<'DiagnosticReport'>
): void {
  if (!entry.fullUrl) {
    throw new OperationOutcomeError(badRequest('DELETE entry in update bundle missing fullUrl'));
  }

  // Extract resource ID from fullUrl (e.g. "Observation/abc-123" -> "abc-123")
  const parts = entry.fullUrl.split('/');
  const resourceId = parts[parts.length - 1];
  if (!resourceId) {
    throw new OperationOutcomeError(badRequest('fullUrl in DELETE entry is not a resolvable reference'));
  }

  // Check content bundle first
  const entryIndex = contentBundle.entry?.findIndex((e) => e.resource?.id === resourceId);
  if (entryIndex !== undefined && entryIndex !== -1) {
    contentBundle.entry = (contentBundle.entry as BundleEntry[]).filter((e) => e.resource?.id !== resourceId);
  } else if (currentContext.context.some((ctx) => ctx.resource?.id === resourceId)) {
    throw new OperationOutcomeError(badRequest('Cannot delete a resource that is part of the original open context'));
  } else {
    throw new OperationOutcomeError(badRequest('Cannot delete resource not currently in the content bundle'));
  }
}

/**
 * Handle a select event (DiagnosticReport-select).
 * Validates that the referenced DiagnosticReport is the current context.
 */
export async function handleSelectEvent(
  projectId: string,
  event: FhircastEventPayload
): Promise<void> {
  const topic = event['hub.topic'];
  const currentContext = await getCurrentContext(projectId, topic);

  if (!currentContext || currentContext['context.type'] !== 'DiagnosticReport') {
    throw new OperationOutcomeError(badRequest('No DiagnosticReport currently open for this topic'));
  }
  // Select events are passed through - no context modification needed
}
