import { forbidden, getResourceTypes, isResourceType, Operator } from '@medplum/core';
import { Login, Project, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';

/**
 * Handles a Project clone request.
 *
 * Endpoint: [fhir base]/Project/[id]/$clone
 *
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function projectCloneHandler(req: Request, res: Response): Promise<void> {
  if (!(res.locals.login as Login).superAdmin) {
    sendOutcome(res, forbidden);
    return;
  }

  const { baseUrl } = getConfig();
  const { id } = req.params;
  const repo = res.locals.repo as Repository;
  const cloner = new ProjectCloner(repo, id);
  await cloner.cloneProject();
  res
    .set('Content-Location', `${baseUrl}fhir/R4/Project/${cloner.idMap.get(id)}`)
    .status(202)
    .json({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'information',
          code: 'informational',
          details: {
            text: 'Accepted',
          },
        },
      ],
    });
}

class ProjectCloner {
  constructor(readonly repo: Repository, readonly projectId: string, readonly idMap: Map<string, string> = new Map()) {}

  async cloneProject(): Promise<void> {
    const repo = this.repo;
    const project = await repo.readResource<Project>('Project', this.projectId);
    const resourceTypes = getResourceTypes();
    const allResources: Resource[] = [];
    const maxResourcesPerResourceType = 1000;

    for (const resourceType of resourceTypes) {
      const bundle = await repo.search({
        resourceType,
        count: maxResourcesPerResourceType,
        filters: [{ code: '_project', operator: Operator.EQUALS, value: project.id as string }],
      });
      if (bundle.entry) {
        for (const entry of bundle.entry) {
          if (entry.resource) {
            this.idMap.set(entry.resource.id as string, randomUUID());
            allResources.push(entry.resource);
          }
        }
      }
    }

    for (const resource of allResources) {
      await repo.updateResource(this.rewriteIds(resource));
    }
  }

  rewriteIds(resource: Resource): Resource {
    return JSON.parse(JSON.stringify(resource, (k, v) => this.rewriteKeyReplacer(k, v)));
  }

  rewriteKeyReplacer(key: string, value: unknown): unknown {
    if ((key === 'id' || key === 'project') && typeof value === 'string' && this.idMap.has(value)) {
      return this.idMap.get(value);
    }
    if (key === 'reference' && typeof value === 'string' && value.includes('/')) {
      const [resourceType, id] = value.split('/');
      if (isResourceType(resourceType) && this.idMap.has(id)) {
        return resourceType + '/' + this.idMap.get(id);
      }
    }
    return value;
  }
}
