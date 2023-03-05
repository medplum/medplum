import { allOk, forbidden, getResourceTypes, Operator } from '@medplum/core';
import { Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';

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
    await new Expunger(repo, id).expunge();
  } else {
    await repo.expungeResource(resourceType, id);
  }
  sendOutcome(res, allOk);
}

class Expunger {
  constructor(readonly repo: Repository, readonly compartment: string) {}

  async expunge(): Promise<void> {
    const repo = this.repo;
    const resourceTypes = getResourceTypes();
    const maxResourcesPerResourceType = 1000;

    for (const resourceType of resourceTypes) {
      const bundle = await repo.search({
        resourceType,
        count: maxResourcesPerResourceType,
        filters: [{ code: '_compartment', operator: Operator.EQUALS, value: this.compartment }],
      });
      if (bundle.entry) {
        for (const entry of bundle.entry) {
          if (entry.resource) {
            await repo.expungeResource(resourceType, entry.resource.id as string);
          }
        }
      }
    }
  }
}
