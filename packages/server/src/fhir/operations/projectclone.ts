import { created, forbidden, getResourceTypes, isResourceType, Operator } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Binary, Project, Resource, ResourceType } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import { Repository } from '../repo';
import { getBinaryStorage } from '../storage';
import { buildBinaryIds } from './utils/binary';

/**
 * Handles a Project clone request.
 *
 * Endpoint: [fhir base]/Project/[id]/$clone
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function projectCloneHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (!ctx.project.superAdmin) {
    return [forbidden];
  }

  const { id } = req.params;
  const { name, resourceTypes, includeIds, excludeIds } = req.body;
  const cloner = new ProjectCloner(ctx.repo, id, name, resourceTypes, includeIds, excludeIds);
  const result = await cloner.cloneProject();
  return [created, result];
}

class ProjectCloner {
  constructor(
    readonly repo: Repository,
    readonly projectId: string,
    readonly projectName: string = '',
    readonly allowedResourceTypes: string[] = [],
    readonly includeIds: string[] = [],
    readonly excludeIds: string[] = [],
    readonly idMap: Map<string, string> = new Map()
  ) {}

  async cloneProject(): Promise<Project> {
    const repo = this.repo;
    const project = await repo.readResource<Project>('Project', this.projectId);
    const resourceTypes = getResourceTypes();
    const allResources: Resource[] = [];
    const binaryIds = new Set<string>();
    const maxResourcesPerResourceType = 1000;

    for (const resourceType of resourceTypes) {
      if (!this.isAllowedResourceType(resourceType) || resourceType === 'Binary') {
        continue;
      }

      const bundle = await repo.search({
        resourceType,
        count: maxResourcesPerResourceType,
        filters: [{ code: '_project', operator: Operator.EQUALS, value: project.id as string }],
      });

      if (!bundle.entry) {
        continue;
      }

      for (const entry of bundle.entry) {
        if (!entry.resource || !this.isAllowedResourceId(entry.resource.id as string)) {
          continue;
        }
        this.idMap.set(entry.resource.id as string, randomUUID());
        buildBinaryIds(entry.resource, binaryIds);
        if (entry.resource.resourceType !== 'Project') {
          allResources.push(entry.resource);
        }
      }
    }

    // Get all binary resources
    if (this.isAllowedResourceType('Binary')) {
      for (const binaryId of binaryIds) {
        const binary = await repo.readResource<Binary>('Binary', binaryId);
        this.idMap.set(binary.id as string, randomUUID());
        allResources.push(binary);
      }
    }

    // Create the project first - otherwise project references will fail
    const newProject = await repo.updateResource<Project>(this.rewriteIds(project));

    // Then create all other resources
    for (const resource of allResources) {
      // Use updateResource to create with specified ID
      // That feature is only available to super admins
      const result = await repo.updateResource(this.rewriteIds(resource));
      if (resource.resourceType === 'Binary') {
        await getBinaryStorage().copyBinary(resource, result as Binary);
      }
    }

    return newProject;
  }

  isAllowedResourceId(resourceId: string): boolean {
    if (this.includeIds.length > 0 && !this.includeIds.includes(resourceId)) {
      return false;
    }
    return !this.excludeIds.includes(resourceId);
  }

  isAllowedResourceType(resourceType: ResourceType): boolean {
    if (resourceType === 'Project') {
      return true;
    }
    if (this.allowedResourceTypes.length > 0) {
      return this.allowedResourceTypes.includes(resourceType);
    }
    return true;
  }

  rewriteIds<T extends Resource>(resource: T): T {
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
        default:
          return resourceObj;
      }
    }

    return resourceObj;
  }

  rewriteKeyReplacer(key: string, value: unknown): unknown {
    if ((key === 'id' || key === 'project') && typeof value === 'string' && this.idMap.has(value)) {
      return this.idMap.get(value);
    }
    if (
      (key === 'reference' && typeof value === 'string' && value.includes('/')) ||
      (key === 'url' && typeof value === 'string' && value.startsWith('Binary/'))
    ) {
      const [resourceType, id] = value.split('/');
      if (isResourceType(resourceType) && this.idMap.has(id)) {
        return resourceType + '/' + this.idMap.get(id);
      }
    }
    return value;
  }
}
