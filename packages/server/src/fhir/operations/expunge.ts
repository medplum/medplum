// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { accepted, allOk, concatUrls, forbidden, getResourceTypes, Operator } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { ResourceType } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { Repository } from '../repo';
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
  const { everything } = req.query;
  if (everything === 'true') {
    const { baseUrl } = getConfig();
    const exec = new AsyncJobExecutor(ctx.repo);
    await exec.init(concatUrls(baseUrl, 'fhir/R4' + req.pathname));
    exec.start(async () => {
      ctx.logger.info('Expunge started', { resourceType, id });
      await new Expunger(ctx.repo, id).expunge();
    });
    return [accepted(exec.getContentLocation(baseUrl))];
  } else {
    await ctx.repo.expungeResource(resourceType, id);
    return [allOk];
  }
}

export class Expunger {
  readonly repo: Repository;
  readonly compartment: string;
  readonly maxResultsPerPage: number;

  constructor(repo: Repository, compartment: string, maxResultsPerPage = 10000) {
    this.repo = repo;
    this.compartment = compartment;
    this.maxResultsPerPage = maxResultsPerPage;
  }

  async expunge(): Promise<void> {
    const resourceTypes = getResourceTypes();
    for (const resourceType of resourceTypes) {
      await this.expungeByResourceType(resourceType);
    }
  }

  async expungeByResourceType(resourceType: ResourceType): Promise<void> {
    if (resourceType === 'Binary') {
      return;
    }

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
        filters: [{ code: '_compartment', operator: Operator.EQUALS, value: this.compartment }],
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
