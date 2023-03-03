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
  const project = await repo.readResource<Project>('Project', id);
  const resourceTypes = getResourceTypes();

  const allResources: Resource[] = [];
  const idMap = new Map<string, string>();
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
          idMap.set(entry.resource.id as string, randomUUID());
          allResources.push(entry.resource);
        }
      }
    }
  }

  for (const resource of allResources) {
    await repo.updateResource(rewriteIds(resource));
  }

  res
    .set('Content-Location', `${baseUrl}fhir/R4/Project/${idMap.get(id)}`)
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

  function rewriteIds(resource: Resource): Resource {
    return JSON.parse(JSON.stringify(resource, rewriteKeyReplacer));
  }

  function rewriteKeyReplacer(key: string, value: unknown): unknown {
    if ((key === 'id' || key === 'project') && typeof value === 'string' && idMap.has(value)) {
      return idMap.get(value);
    }
    if (key === 'reference' && typeof value === 'string' && value.includes('/')) {
      const [resourceType, id] = value.split('/');
      if (isResourceType(resourceType) && idMap.has(id)) {
        return resourceType + '/' + idMap.get(id);
      }
    }
    return value;
  }
}
