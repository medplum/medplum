import { created, forbidden, getResourceTypes, isResourceType, Operator } from '@medplum/core';
import { Login, Project, Resource, ResourceType } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';
import { sendResponse } from '../routes';

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

  const { id } = req.params;
  const { name, resourceTypes, includeIds, excludeIds } = req.body;
  const repo = res.locals.repo as Repository;
  const cloner = new ProjectCloner(repo, id, name, resourceTypes, includeIds, excludeIds);
  const result = await cloner.cloneProject();
  await sendResponse(res, created, result);
}

class ProjectCloner {
  constructor(
    readonly repo: Repository,
    readonly projectId: string,
    readonly projectName: string = '',
    readonly allowedResourceTypes: Array<string> = [],
    readonly includeIds: Array<string> = [],
    readonly excludeIds: Array<string> = [],
    readonly idMap: Map<string, string> = new Map()
  ) {}

  async cloneProject(): Promise<Project> {
    const repo = this.repo;
    const project = await repo.readResource<Project>('Project', this.projectId);
    const resourceTypes = getResourceTypes();
    const allResources: Resource[] = [];
    const maxResourcesPerResourceType = 1000;
    let newProject: Project | undefined = undefined;

    for (const resourceType of resourceTypes) {
      const bundle = await repo.search({
        resourceType,
        count: maxResourcesPerResourceType,
        filters: [{ code: '_project', operator: Operator.EQUALS, value: project.id as string }],
      });
      if (bundle.entry) {
        for (const entry of bundle.entry) {
          if (entry.resource) {
            if (this.isResourceAllowed(entry.resource)) {
              this.idMap.set(entry.resource.id as string, randomUUID());
              allResources.push(entry.resource);
            }
          }
        }
      }
    }

    for (const resource of allResources) {
      // Use updateResource to create with specified ID
      // That feature is only available to super admins
      const result = await repo.updateResource(this.rewriteIds(resource));
      if (result.resourceType === 'Project') {
        newProject = result;
      }
    }

    return newProject as Project;
  }

  isResourceAllowed(resource: Resource): boolean {
    if (resource.resourceType === 'Project') {
      return true;
    }
    if (!this.isAllowedResourceType(resource.resourceType)) {
      return false;
    }

    if (!this.isAllowedResourceId(resource.id as string)) {
      return false;
    }

    return true;
  }

  isAllowedResourceId(resourceId: string): boolean {
    if (this.includeIds.length > 0 && !this.includeIds.includes(resourceId)) {
      return false;
    }
    if (this.excludeIds.length > 0 && this.excludeIds.includes(resourceId)) {
      return false;
    }
    return true;
  }

  isAllowedResourceType(resourceType: ResourceType): boolean {
    if (this.allowedResourceTypes.length > 0 && !this.allowedResourceTypes.includes(resourceType)) {
      return false;
    }
    return true;
  }

  rewriteIds(resource: Resource): Resource {
    const resourceObj = JSON.parse(JSON.stringify(resource, (k, v) => this.rewriteKeyReplacer(k, v)));

    if (this.projectName) {
      switch (resource.resourceType) {
        case 'Project':
          resourceObj.name = this.projectName;
          break;
        case 'ProjectMembership':
          resourceObj.project.display = this.projectName;
          break;
        case 'ClientApplication':
          if (resource.name?.endsWith(' Default Client')) {
            resourceObj.name = `${this.projectName} Default Client`;
            resourceObj.description = `Default client for ${this.projectName}`;
          }
          break;
      }
    }

    return resourceObj;
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
