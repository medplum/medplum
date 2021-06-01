import { Bundle, OperationOutcome, Reference, Resource } from '@medplum/core';
import { knex } from '../database';
import { allOk, badRequest, notFound } from './outcomes';
import { validateResource, validateResourceType } from './schema';
import { getSearchParameter, SearchRequest } from './search';

export type RepositoryResult<T extends Resource | undefined> = Promise<[OperationOutcome, T | undefined]>;

class Repository {

  async createBatch(bundle: Bundle): RepositoryResult<Bundle> {
    const validateOutcome = validateResource(bundle);
    if (validateOutcome.id !== 'allok') {
      return [validateOutcome, undefined];
    }

    return [allOk, bundle];
  }

  async createResource<T extends Resource>(resource: T): RepositoryResult<T> {
    const validateOutcome = validateResource(resource);
    if (validateOutcome.id !== 'allok') {
      return [validateOutcome, undefined];
    }

    return [allOk, resource];
  }

  async readResource<T extends Resource>(resourceType: string, id: string): RepositoryResult<T> {
    const validateOutcome = validateResourceType(resourceType);
    if (validateOutcome.id !== 'allok') {
      return [validateOutcome, undefined];
    }

    const rows = await knex.select('CONTENT')
      .from(resourceType.toUpperCase())
      .where('ID', id);

    if (rows.length === 0) {
      return [notFound, undefined];
    }

    return [allOk, JSON.parse(rows[0].CONTENT as string)];
  }

  async readReference<T extends Resource>(reference: Reference): RepositoryResult<T> {
    const parts = reference.reference?.split('/');
    if (!parts || parts.length !== 2) {
      return [badRequest('Invalid reference'), undefined];
    }
    return this.readResource(parts[0], parts[1]);
  }

  async readHistory(resourceType: string, id: string): RepositoryResult<Bundle> {
    const validateOutcome = validateResourceType(resourceType);
    if (validateOutcome.id !== 'allok') {
      return [validateOutcome, undefined];
    }

    const builder = knex.select('CONTENT')
      .from(resourceType.toUpperCase() + '_HISTORY')
      .where('ID', id);

    const rows = await builder;

    return [allOk, {
      resourceType: 'Bundle',
      type: 'history',
      entry: rows.map(row => ({
        resource: JSON.parse(row.CONTENT as string)
      }))
    }];
  }

  async readVersion(resourceType: string, id: string, vid: string): RepositoryResult<Bundle> {
    const validateOutcome = validateResourceType(resourceType);
    if (validateOutcome.id !== 'allok') {
      return [validateOutcome, undefined];
    }

    const rows = await knex.select('CONTENT')
      .from(resourceType.toUpperCase() + '_HISTORY')
      .where('ID', id)
      .andWhere('VERSIONID', vid);

    if (rows.length === 0) {
      return [notFound, undefined];
    }

    return [allOk, JSON.parse(rows[0].CONTENT as string)];
  }

  async updateResource<T extends Resource>(resource: T): RepositoryResult<T> {
    const validateOutcome = validateResource(resource);
    if (validateOutcome.id !== 'allok') {
      return [validateOutcome, undefined];
    }

    return [allOk, resource];
  }

  async deleteResource(resourceType: string, id: string): RepositoryResult<undefined> {
    const validateOutcome = validateResourceType(resourceType);
    if (validateOutcome.id !== 'allok') {
      return [validateOutcome, undefined];
    }

    return [allOk, undefined];
  }

  async patchResource(resource: Resource): RepositoryResult<Resource> {
    const validateOutcome = validateResource(resource);
    if (validateOutcome.id !== 'allok') {
      return [validateOutcome, undefined];
    }

    return [allOk, resource];
  }

  async search(searchRequest: SearchRequest): RepositoryResult<Bundle> {
    const validateOutcome = validateResourceType(searchRequest.resourceType);
    if (validateOutcome.id !== 'allok') {
      return [validateOutcome, undefined];
    }

    const builder = knex.select('CONTENT').from(searchRequest.resourceType.toUpperCase());
    for (const filter of searchRequest.filters) {
      const param = getSearchParameter(searchRequest.resourceType, filter.code);
      if (param) {
        builder.where((param.code as string).toUpperCase(), filter.value);
      }
    }

    const rows = await builder;

    return [allOk, {
      resourceType: 'Bundle',
      type: 'searchest',
      entry: rows.map(row => ({
        resource: JSON.parse(row.CONTENT as string)
      }))
    }];
  }
}

export const repo = new Repository();
