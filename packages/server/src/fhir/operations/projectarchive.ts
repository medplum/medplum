// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  accepted,
  AccessPolicyInteraction,
  concatUrls,
  createReference,
  forbidden,
  getResourceTypes,
  MEDPLUM_VERSION,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { AccessPolicy, Project, Resource, ResourceType } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { queueProjectArchive } from '../../workers/bulk-export';
import type { Repository } from '../repo';
import { parseHistoryContent } from '../repository/row-builder';
import { SelectQuery } from '../sql';
import { makeOperationDefinition } from './definitions';
import { BulkExporter } from './utils/bulkexporter';
import { parseInputParameters } from './utils/parameters';

const operation = makeOperationDefinition(
  { scope: 'instance', resource: 'Project' },
  {
    name: 'archive',
    code: 'archive',
    parameter: [{ use: 'in', name: 'includeAuditEvents', type: 'boolean', min: 0, max: '1' }],
  }
);

interface ArchiveInput {
  includeAuditEvents?: boolean;
}

const unarchivedResourceTypes = new Set(['AsyncJob', 'BulkDataExport']);

const archivePageSize = 1000;

/**
 * Handles a Project archive request.
 * Exports every version of every resource in the project, preserving ids and meta,
 * so the project can be restored into another Medplum server.
 *
 * Endpoint
 *   [fhir base]/Project/[id]/$archive
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function projectArchiveHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { project, membership } = ctx;
  if (
    req.params.id !== project.id ||
    project.superAdmin ||
    !membership.admin ||
    !project.features?.includes('archive') ||
    !hasUnrestrictedReadAccess(ctx.repo.effectiveAccessPolicy())
  ) {
    return [forbidden];
  }

  const { includeAuditEvents } = parseInputParameters<ArchiveInput>(operation, req);
  const { baseUrl } = getConfig();
  const exporter = new BulkExporter(ctx.repo);
  const asyncJob = await exporter.start(concatUrls(baseUrl, 'fhir/R4' + req.pathname));
  await queueProjectArchive(asyncJob, { includeAuditEvents });
  return [accepted(`${baseUrl}fhir/R4/job/${asyncJob.id}/status`)];
}

/**
 * A partial archive is useless for migration, and raw history reads cannot evaluate criteria,
 * so require a wildcard policy without criteria. Per-version checks still enforce access.
 * @param accessPolicy - The caller's effective access policy.
 * @returns True if the caller can read every resource in the project.
 */
function hasUnrestrictedReadAccess(accessPolicy: Readonly<AccessPolicy> | undefined): boolean {
  return !accessPolicy || !!accessPolicy.resource?.some((r) => r.resourceType === '*' && !r.criteria);
}

export async function archiveProject(
  exporter: BulkExporter,
  project: WithId<Project>,
  includeAuditEvents?: boolean
): Promise<void> {
  // Extended mode keeps meta.author, meta.project, meta.compartment, and meta.accounts
  const repo = exporter.repo.withOverrideConfig({ extendedMode: true });
  for (const resourceType of getResourceTypes()) {
    if (
      !unarchivedResourceTypes.has(resourceType) &&
      (resourceType !== 'AuditEvent' || includeAuditEvents) &&
      repo.supportsInteraction(AccessPolicyInteraction.HISTORY, resourceType)
    ) {
      await archiveResourceType(exporter, repo, project.id, resourceType);
    }
  }
  await exporter.close(project, [
    { name: 'project', valueReference: createReference(project) },
    { name: 'medplumVersion', valueString: MEDPLUM_VERSION },
  ]);
}

interface HistoryRow {
  id: string;
  versionId: string;
  lastUpdated: Date;
  content: string | null;
}

async function archiveResourceType(
  exporter: BulkExporter,
  repo: Repository,
  projectId: string,
  resourceType: ResourceType
): Promise<void> {
  // _History has no projectId, so page ids from the main table. Deleted resources keep their row.
  let ids: string[] = [];
  do {
    const idQuery = new SelectQuery(resourceType)
      .column('id')
      .where('projectId', '=', projectId)
      .orderBy('id')
      .limit(archivePageSize);
    if (ids.length) {
      idQuery.where('id', '>', ids.at(-1));
    }
    ids = (await repo.sqlRead<{ id: string }>(idQuery, resourceType)).map((r) => r.id);
    if (!ids.length) {
      break;
    }

    const rows = await repo.sqlRead<HistoryRow>(
      new SelectQuery(resourceType + '_History')
        .column('id')
        .column('versionId')
        .column('lastUpdated')
        .column('content')
        .where('id', 'IN', ids)
        .orderBy('id')
        .orderBy('lastUpdated'),
      resourceType
    );
    for (const row of rows) {
      const resource = archiveVersion(repo, resourceType, row);
      if (resource) {
        await exporter.writeResource(resource, { skipDedupe: true });
      }
    }
  } while (ids.length === archivePageSize);
  await exporter.closeWriter(resourceType);
}

function archiveVersion(repo: Repository, resourceType: ResourceType, row: HistoryRow): WithId<Resource> | undefined {
  const resource = parseHistoryContent(row.content) as WithId<Resource>;
  if (resource.meta?.deleted) {
    // Older tombstones have empty content, so rebuild from the row
    const meta = { ...resource.meta, versionId: row.versionId, lastUpdated: new Date(row.lastUpdated).toISOString() };
    return { resourceType, id: row.id, meta } as WithId<Resource>;
  }
  // Skip output of previous exports and archives, including this one
  if (resource.resourceType === 'Binary' && resource.securityContext?.reference?.startsWith('AsyncJob/')) {
    return undefined;
  }
  // An older version may belong to another project; hidden fields are removed like the _history API
  if (!repo.canPerformInteraction(AccessPolicyInteraction.READ, resource)) {
    return undefined;
  }
  return repo.removeHiddenFields(resource);
}
