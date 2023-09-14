import { accepted, allOk, forbidden, getResourceTypes, Operator } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';
import { AsyncJobExecutor } from './utils/asyncjobexecutor';
import { getAuthenticatedContext } from '../../context';

/**
 * Handles an expunge request.
 *
 * Endpoint: [fhir base]/[resourceType]/[id]/$expunge
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function expungeHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  if (!ctx.login.superAdmin) {
    sendOutcome(res, forbidden);
    return;
  }

  const { resourceType, id } = req.params;
  const { everything } = req.query;
  if (everything === 'true') {
    const { baseUrl } = getConfig();
    const exec = new AsyncJobExecutor(ctx.repo);
    await exec.init(req.protocol + '://' + req.get('host') + req.originalUrl);
    exec.start(async () => {
      ctx.logger.info('Expunge started', { resourceType, id });
      await new Expunger(ctx.repo, id).expunge();
    });
    sendOutcome(res, accepted(exec.getContentLocation(baseUrl)));
  } else {
    await ctx.repo.expungeResource(resourceType, id);
  }
  sendOutcome(res, allOk);
}

export class Expunger {
  constructor(
    readonly repo: Repository,
    readonly compartment: string,
    readonly maxResultsPerPage = 10000
  ) {
    this.maxResultsPerPage = maxResultsPerPage;
  }

  async expunge(): Promise<void> {
    const resourceTypes = getResourceTypes();

    for (const resourceType of resourceTypes) {
      await this.expungeByResourceType(resourceType);
    }
  }

  async expungeByResourceType(resourceType: ResourceType): Promise<void> {
    const repo = this.repo;
    let hasNext = true;
    while (hasNext) {
      const bundle = await repo.search({
        resourceType,
        count: this.maxResultsPerPage,
        filters: [{ code: '_compartment', operator: Operator.EQUALS, value: this.compartment }],
      });

      if (bundle.entry && bundle.entry.length > 0) {
        const resourcesToExpunge: string[] = [];
        for (const entry of bundle.entry) {
          if (entry.resource?.id) {
            resourcesToExpunge.push(entry.resource.id);
          }
        }
        await repo.expungeResources(resourceType, resourcesToExpunge);

        const linkNext = bundle.link?.find((b) => b.relation === 'next');

        if (!linkNext?.url) {
          hasNext = false;
        }
      } else {
        hasNext = false;
      }
    }
  }
}
