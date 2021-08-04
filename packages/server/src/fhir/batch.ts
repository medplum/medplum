import { Bundle, BundleEntry } from '@medplum/core';
import { randomUUID } from 'crypto';
import { allOk, badRequest, getStatus, isOk } from './outcomes';
import { Repository, RepositoryResult } from './repo';

export async function createBatch(repo: Repository, bundle: Bundle): RepositoryResult<Bundle> {
  const bundleType = bundle.type;
  if (!bundleType) {
    return [badRequest('Missing bundle type'), undefined];
  }

  if (bundleType !== 'batch' && bundleType !== 'transaction') {
    return [badRequest('Unrecognized bundle type'), undefined];
  }

  const entries = bundle.entry;
  if (!entries) {
    return [badRequest('Missing bundle entry'), undefined];
  }

  const result: Bundle = {
    resourceType: 'Bundle',
    entry: []
  };

  const ids = findIds(entries);
  const rewritten = rewriteIdsInObject(bundle, ids);

  for (const entry of rewritten.entry) {
    let resource = entry.resource;
    if (!resource) {
      continue;
    }
    if (!resource.id) {
      resource = { ...resource, id: randomUUID() };
    }
    const [updateOutcome, updateResource] = await repo.updateResource(resource);
    (result.entry as BundleEntry[]).push({
      response: {
        outcome: updateOutcome,
        status: getStatus(updateOutcome).toString(),
        location: isOk(updateOutcome) ? updateResource.resourceType + '/' + updateResource.id : undefined
      }
    });
  }

  return [allOk, result];
}

interface OutputId {
  resourceType: string;
  id: string;
}

function findIds(entries: BundleEntry[]): Record<string, OutputId> {
  const result: Record<string, OutputId> = {};

  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource) {
      continue;
    }

    const fullUrl = entry.fullUrl;
    if (!fullUrl?.startsWith('urn:uuid:')) {
      continue;
    }

    const inputId = fullUrl.substring('urn:uuid:'.length);
    const output = {
      resourceType: resource.resourceType,
      id: randomUUID()
    };

    // Direct ID: replace local value with generated ID
    result[inputId] = output;

    // Reference: replace prefixed value with reference string
    result[fullUrl] = output;
  }

  return result;
}

function rewriteIds(input: any, ids: Record<string, OutputId>, forceFull?: boolean): any {
  if (Array.isArray(input)) {
    return rewriteIdsInArray(input, ids);
  }
  if (typeof input === 'string') {
    return rewriteIdsInString(input, ids, forceFull);
  }
  if (typeof input === 'object') {
    return rewriteIdsInObject(input, ids);
  }
  return input;
}

function rewriteIdsInArray(input: any[], ids: Record<string, OutputId>): any[] {
  return input.map(item => rewriteIds(item, ids));
}

function rewriteIdsInObject(input: any, ids: Record<string, OutputId>): any {
  return Object.fromEntries(
    Object.entries(input).map(
      ([k, v]) => [k, rewriteIds(v, ids, k === 'reference')]
    )
  );
}

function rewriteIdsInString(input: string, ids: Record<string, OutputId>, forceFull?: boolean) {
  const resource = ids[input];
  if (!resource) {
    return input;
  }
  if (input.startsWith('urn:uuid:') || forceFull) {
    return `${resource.resourceType}/${resource.id}`
  } else {
    return resource.id;
  }
}
