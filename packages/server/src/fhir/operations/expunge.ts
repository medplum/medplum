// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter } from '@medplum/core';
import {
  accepted,
  AccessPolicyInteraction,
  allOk,
  badRequest,
  concatUrls,
  forbidden,
  getResourceTypes,
  isResourceType,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { ResourceType } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { DatabaseMode } from '../../database';
import type { Repository } from '../repo';
import { SelectQuery } from '../sql';
import { AsyncJobExecutor } from './utils/asyncjobexecutor';
import { buildBinaryIds } from './utils/binary';

/**
 * Handles an expunge request.
 *
 * Endpoint: [fhir base]/[resourceType]/[id]/$expunge
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function expungeHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (!ctx.project.superAdmin && !ctx.membership.admin) {
    return [forbidden];
  }

  const { resourceType, id } = req.params;
  if (!isResourceType(resourceType)) {
    throw new OperationOutcomeError(badRequest('Invalid resource type'), { cause: resourceType });
  }
  const { everything } = req.query;
  if (resourceType === 'Project' || everything === 'true') {
    // Only super admins can expunge a project other than the current project.
    // For non-Project resources, the project-scoped repo restricts the compartment
    // search to the caller's own project, so project admins can safely expunge within it.
    if (resourceType === 'Project' && !ctx.project.superAdmin && id !== ctx.project.id) {
      return [forbidden];
    }
    const { baseUrl } = getConfig();
    const exec = new AsyncJobExecutor(ctx.repo);
    await exec.init(concatUrls(baseUrl, 'fhir/R4' + req.pathname));
    exec.start(async () => {
      ctx.logger.info('Expunge started', { resourceType, id });
      await new Expunger(ctx.repo, id, { project: resourceType === 'Project' }).expunge();
    });
    return [accepted(exec.getContentLocation(baseUrl))];
  } else {
    await ctx.repo.expungeResource(resourceType, id);
    return [allOk];
  }
}

// Storage objects are deleted after each batch commits, so an interrupted job can orphan up to one batch of them
const binaryBatchSize = 1000;

export interface ExpungerOptions {
  /** True if the compartment is a Project, which also expunges its deleted resources and all of its Binaries. */
  readonly project?: boolean;
  readonly maxResultsPerPage?: number;
}

export class Expunger {
  readonly repo: Repository;
  readonly compartment: string;
  readonly project: boolean;
  readonly maxResultsPerPage: number;

  constructor(repo: Repository, compartment: string, options: ExpungerOptions = {}) {
    this.repo = repo;
    this.compartment = compartment;
    this.project = !!options.project;
    this.maxResultsPerPage = options.maxResultsPerPage ?? 10000;
  }

  async expunge(): Promise<void> {
    const resourceTypes = getResourceTypes();
    for (const resourceType of resourceTypes) {
      await this.expungeByResourceType(resourceType);
    }
  }

  async expungeByResourceType(resourceType: ResourceType): Promise<void> {
    if (resourceType === 'Binary') {
      if (this.project) {
        await this.expungeProjectBinaries();
      }
      return;
    }

    // Skip resource types the repository is not allowed to search (e.g. protected
    // resource types such as Login/JsonWebKey/DomainConfiguration for non-super-admins).
    // Otherwise the search below throws "forbidden" and aborts the entire expunge job.
    if (!this.repo.supportsInteraction(AccessPolicyInteraction.SEARCH, resourceType)) {
      return;
    }

    await this.expungeMatching(resourceType, [
      { code: '_compartment', operator: Operator.EQUALS, value: this.compartment },
    ]);
    if (this.project) {
      // Deleted rows have no compartments or search columns, only a projectId, so access policy
      // criteria never match them either
      await this.expungeMatching(resourceType, [
        { code: '_deleted', operator: Operator.EQUALS, value: 'true' },
        { code: '_project', operator: Operator.EQUALS, value: this.compartment },
      ]);
    }
  }

  /**
   * Binary is not searchable, so select Binary ids by projectId directly, including deleted rows.
   * Only for Project expunges, which the handler limits to the caller's own project unless super admin,
   * so every selected Binary is one expungeResources can delete and each batch makes progress.
   */
  private async expungeProjectBinaries(): Promise<void> {
    const batchSize = Math.min(this.maxResultsPerPage, binaryBatchSize);
    let ids: string[];
    do {
      // Read from the writer so a lagging replica cannot return Binaries that were just expunged
      const rows = await this.repo.sqlRead<{ id: string }>(
        new SelectQuery('Binary').column('id').where('projectId', '=', this.compartment).limit(batchSize),
        'Binary',
        { mode: DatabaseMode.WRITER }
      );
      ids = rows.map((r) => r.id);
      if (ids.length) {
        await this.repo.expungeResources('Binary', ids);
      }
    } while (ids.length === batchSize);
  }

  private async expungeMatching(resourceType: ResourceType, filters: Filter[]): Promise<void> {
    const repo = this.repo;
    // NOTE(ThatOneBro 23/01/2025): Attempted to convert this to using `repo.processAllResources`,
    // But it doesn't quite fit the pattern since the "next" links are not usable
    // As the expunge process is destructive and the "cursor" essentially is always at the beginning of the table
    // We delete the next N resources over and over and use the "next" link as a signal if there are more resources to delete
    let hasNext = true;
    while (hasNext) {
      const bundle = await repo.search({
        resourceType,
        count: this.maxResultsPerPage,
        filters,
      });

      if (!bundle.entry || bundle.entry.length === 0) {
        break;
      }

      const resourcesToExpunge: string[] = [];
      const binaryIds = new Set<string>();

      for (const entry of bundle.entry) {
        if (entry.resource?.id) {
          resourcesToExpunge.push(entry.resource.id);
          buildBinaryIds(entry.resource, binaryIds);
        }
      }
      await repo.expungeResources(resourceType, resourcesToExpunge);
      if (binaryIds.size > 0) {
        await repo.expungeResources('Binary', Array.from(binaryIds));
      }

      const linkNext = bundle.link?.find((b) => b.relation === 'next');
      if (!linkNext?.url) {
        hasNext = false;
      }
    }
  }
}
