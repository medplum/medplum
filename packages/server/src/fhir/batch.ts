import { allOk, badRequest, Bundle, BundleEntry, getReferenceString, getStatus, isOk, notFound, OperationOutcome, Resource } from '@medplum/core';
import { randomUUID } from 'crypto';
import { URL } from 'url';
import { Repository, RepositoryResult } from './repo';
import { parseSearchRequest } from './search';

export async function processBatch(repo: Repository, bundle: Bundle): RepositoryResult<Bundle> {
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

  const ids = findIds(entries);
  const rewritten = rewriteIdsInObject(bundle, ids);
  const resultEntries: BundleEntry[] = [];

  for (const entry of rewritten.entry) {
    resultEntries.push(await processBatchEntry(repo, entry));
  }

  const result: Bundle = {
    resourceType: 'Bundle',
    entry: resultEntries
  };

  return [allOk, result];
}

async function processBatchEntry(repo: Repository, entry: BundleEntry): Promise<BundleEntry> {
  if (!entry.request) {
    return buildBundleResponse(badRequest('Missing entry.request'));
  }

  if (!entry.request.method) {
    return buildBundleResponse(badRequest('Missing entry.request.method'));
  }

  if (!entry.request.url) {
    return buildBundleResponse(badRequest('Missing entry.request.url'));
  }

  // Pass in dummy host for parsing purposes.
  // The host is ignored.
  const url = new URL(entry.request.url, 'https://example.com/');

  switch (entry.request.method) {
    case 'GET':
      return processGet(repo, entry, url);

    case 'POST':
      return processPost(repo, entry, url);

    case 'PUT':
      return processPut(repo, entry, url);

    default:
      return buildBundleResponse(badRequest('Unsupported entry.request.method'));
  }
}

async function processGet(repo: Repository, entry: BundleEntry, url: URL): Promise<BundleEntry> {
  const path = url.pathname.split('/');
  if (path.length === 2) {
    return processSearch(repo, url, path[1]);
  }
  if (path.length === 3) {
    return processReadResource(repo, path[1], path[2]);
  }
  return buildBundleResponse(notFound);
}

async function processSearch(repo: Repository, url: URL, resourceType: string): Promise<BundleEntry> {
  const query = Object.fromEntries(url.searchParams.entries()) as Record<string, string>;
  const [outcome, bundle] = await repo.search(parseSearchRequest(resourceType, query));
  return buildBundleResponse(outcome, bundle, true);
}

async function processReadResource(repo: Repository, resourceType: string, id: string): Promise<BundleEntry> {
  const [outcome, resource] = await repo.readResource(resourceType, id);
  return buildBundleResponse(outcome, resource, true);
}

async function processPost(repo: Repository, entry: BundleEntry, url: URL): Promise<BundleEntry> {
  const path = url.pathname.split('/');
  if (path.length === 2) {
    return processCreateResource(repo, entry.resource);
  }
  return buildBundleResponse(notFound);
}

async function processCreateResource(repo: Repository, resource: Resource | undefined): Promise<BundleEntry> {
  if (!resource) {
    return buildBundleResponse(badRequest('Missing entry.resource'));
  }

  const [outcome, result] = await repo.createResource(resource);
  return buildBundleResponse(outcome, result);
}

async function processPut(repo: Repository, entry: BundleEntry, url: URL): Promise<BundleEntry> {
  const path = url.pathname.split('/');
  if (path.length === 3) {
    return processUpdateResource(repo, entry.resource);
  }
  return buildBundleResponse(notFound);
}

async function processUpdateResource(repo: Repository, resource: Resource | undefined): Promise<BundleEntry> {
  if (!resource) {
    return buildBundleResponse(badRequest('Missing entry.resource'));
  }
  const [outcome, result] = await repo.updateResource(resource);
  return buildBundleResponse(outcome, result);
}

function buildBundleResponse(outcome: OperationOutcome, resource?: Resource, full?: boolean): BundleEntry {
  return {
    response: {
      outcome: outcome,
      status: getStatus(outcome).toString(),
      location: isOk(outcome) && resource?.id ? getReferenceString(resource) : undefined
    },
    resource: (full && resource) || undefined
  };
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
