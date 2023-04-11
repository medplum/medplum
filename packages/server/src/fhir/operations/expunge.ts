import { allOk, forbidden, getResourceTypes, Operator } from '@medplum/core';
import { Login, ResourceType } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';
import { logger } from '../../logger';

/**
 * Handles an expunge request.
 *
 * Endpoint: [fhir base]/[resourceType]/[id]/$expunge
 *
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function expungeHandler(req: Request, res: Response): Promise<void> {
  if (!(res.locals.login as Login).superAdmin) {
    sendOutcome(res, forbidden);
    return;
  }

  const { resourceType, id } = req.params;
  const { everything } = req.query;
  const repo = res.locals.repo as Repository;
  if (everything === 'true') {
    logger.info(`expunge started for ${resourceType}/${id}`);
    new Expunger(repo, id)
      .expunge()
      .then(() => logger.info(`expunge for ${resourceType}/${id} is completed`))
      .catch((err) => logger.error(`expunge ${resourceType}/${id} failed: ${err}`));
  } else {
    await repo.expungeResource(resourceType, id);
  }
  sendOutcome(res, allOk);
}

export class Expunger {
  constructor(readonly repo: Repository, readonly compartment: string, readonly maxResultsPerPage = 10000) {
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
