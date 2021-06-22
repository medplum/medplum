import { Bundle, BundleEntry } from '@medplum/core';
import { randomUUID } from 'crypto';
import { allOk, badRequest } from './outcomes';
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

  for (const entry of rewriteIdsInObject(bundle, ids).entry) {
    const resource = entry.resource;
    const [updateOutcome, updateResource] = await repo.updateResource(resource);
    (result.entry as BundleEntry[]).push({
      response: {
        status: updateOutcome.id,
        location: updateResource.resourceType + '/' + updateResource.id
      }
    });
  }

  return [allOk, result];
}

function findIds(entries: BundleEntry[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource) {
      continue;
    }

    const fullUrl = entry.fullUrl;
    if (!fullUrl?.startsWith('urn:uuid:')) {
      continue;
    }

    // Direct ID: replace local value with generated ID
    const inputId = fullUrl.substring('urn:uuid:'.length);
    const outputId = randomUUID();
    result[inputId] = outputId;

    // Reference: replace prefixed value with reference string
    result[fullUrl] = resource.resourceType + '/' + outputId;
  }

  return result;
}

function rewriteIds(input: any, ids: Record<string, string>): any {
  if (Array.isArray(input)) {
    return rewriteIdsInArray(input, ids);
  }
  if (typeof input === 'string') {
    return rewriteIdsInString(input, ids);
  }
  if (typeof input === 'object') {
    return rewriteIdsInObject(input, ids);
  }
  return input;
}

function rewriteIdsInArray(input: any[], ids: Record<string, string>): any[] {
  return input.map(item => rewriteIds(item, ids));
}

function rewriteIdsInObject(input: any, ids: Record<string, string>): any {
  return Object.fromEntries(
    Object.entries(input).map(
      ([k, v]) => [k, rewriteIds(v, ids)]
    )
  );
}

function rewriteIdsInString(input: string, ids: Record<string, string>) {
  return input in ids ? ids[input] : input;
}
