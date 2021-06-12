import { Bundle, Meta, OperationOutcome, Reference, Resource, SearchParameter, SearchRequest } from '@medplum/core';
import { randomUUID } from 'crypto';
import validator from 'validator';
import { getKnex } from '../database';
import { HumanNameTable, IdentifierTable, LookupTable } from './lookuptable';
import { allOk, badRequest, isNotFound, isOk, notFound } from './outcomes';
import { validateResource, validateResourceType } from './schema';
import { getSearchParameter, getSearchParameters } from './search';

export type RepositoryResult<T extends Resource | undefined> = Promise<[OperationOutcome, T | undefined]>;

class Repository {
  private readonly lookupTables: LookupTable[];

  constructor() {
    this.lookupTables = [
      new HumanNameTable(),
      new IdentifierTable()
    ];
  }

  async createBatch(bundle: Bundle): RepositoryResult<Bundle> {
    const validateOutcome = validateResource(bundle);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    return [allOk, bundle];
  }

  async createResource<T extends Resource>(resource: T): RepositoryResult<T> {
    const validateOutcome = validateResource(resource);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    return this.updateResource({
      ...resource,
      id: randomUUID()
    });
  }

  async readResource<T extends Resource>(resourceType: string, id: string): RepositoryResult<T> {
    if (!validator.isUUID(id)) {
      return [badRequest('Invalid UUID'), undefined];
    }

    const validateOutcome = validateResourceType(resourceType);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    const knex = getKnex();
    const rows = await knex.select('content')
      .from(resourceType)
      .where('id', id);

    if (rows.length === 0) {
      return [notFound, undefined];
    }

    return [allOk, JSON.parse(rows[0].content as string)];
  }

  async readReference<T extends Resource>(reference: Reference): RepositoryResult<T> {
    const parts = reference.reference?.split('/');
    if (!parts || parts.length !== 2) {
      return [badRequest('Invalid reference'), undefined];
    }
    return this.readResource(parts[0], parts[1]);
  }

  async readHistory(resourceType: string, id: string): RepositoryResult<Bundle> {
    if (!validator.isUUID(id)) {
      return [badRequest('Invalid UUID'), undefined];
    }

    const validateOutcome = validateResourceType(resourceType);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    const knex = getKnex();
    const builder = knex.select('content')
      .from(resourceType + '_History')
      .where('id', id);

    const rows = await builder;

    return [allOk, {
      resourceType: 'Bundle',
      type: 'history',
      entry: rows.map(row => ({
        resource: JSON.parse(row.content as string)
      }))
    }];
  }

  async readVersion(resourceType: string, id: string, vid: string): RepositoryResult<Bundle> {
    if (!validator.isUUID(id) || !validator.isUUID(vid)) {
      return [badRequest('Invalid UUID'), undefined];
    }

    const validateOutcome = validateResourceType(resourceType);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    const knex = getKnex();
    const rows = await knex.select('content')
      .from(resourceType + '_History')
      .where('id', id)
      .andWhere('versionId', vid);

    if (rows.length === 0) {
      return [notFound, undefined];
    }

    return [allOk, JSON.parse(rows[0].content as string)];
  }

  async updateResource<T extends Resource>(resource: T): RepositoryResult<T> {
    const validateOutcome = validateResource(resource);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    const { resourceType, id } = resource;
    if (!id) {
      return [badRequest('Missing id'), undefined];
    }

    const [existingOutcome, existing] = await this.readResource(resourceType, id);
    if (!isOk(existingOutcome) && !isNotFound(existingOutcome)) {
      return [existingOutcome, undefined];
    }

    const result = {
      ...existing,
      ...resource,
      meta: {
        ...existing?.meta,
        ...resource.meta,
        versionId: randomUUID(),
        lastUpdated: new Date()
      }
    };

    await this.write(result);

    return [allOk, result];
  }

  async deleteResource(resourceType: string, id: string): RepositoryResult<undefined> {
    if (!validator.isUUID(id)) {
      return [badRequest('Invalid UUID'), undefined];
    }

    const validateOutcome = validateResourceType(resourceType);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    const [readOutcome, resource] = await this.readResource(resourceType, id);
    if (!isOk(readOutcome)) {
      return [readOutcome, undefined];
    }

    // TODO
    console.log(`DELETE resourceType=${resource?.resourceType} / id=${resource?.id}`);

    return [allOk, undefined];
  }

  async patchResource(resource: Resource): RepositoryResult<Resource> {
    const validateOutcome = validateResource(resource);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    return [allOk, resource];
  }

  async search(searchRequest: SearchRequest): RepositoryResult<Bundle> {
    const resourceType = searchRequest.resourceType;
    const validateOutcome = validateResourceType(resourceType);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    const knex = getKnex();
    const builder = knex.select('content').from(resourceType);
    for (const filter of searchRequest.filters) {
      const param = getSearchParameter(resourceType, filter.code);
      if (param) {
        const lookupTable = this.getLookupTable(param);
        if (lookupTable) {
          lookupTable.addSearchConditions(resourceType, builder, filter);
        } else if (param.type === 'string') {
          builder.where(param.code as string, 'LIKE', '%' + filter.value + '%');
        } else {
          builder.where(param.code as string, filter.value);
        }
      }
    }

    const count = searchRequest.count || 10;
    const page = searchRequest.page || 0;
    builder.limit(count);
    builder.offset(count * page);

    const rows = await builder;

    return [allOk, {
      resourceType: 'Bundle',
      type: 'searchest',
      entry: rows.map(row => ({
        resource: JSON.parse(row.content as string)
      }))
    }];
  }

  private async write(resource: Resource): Promise<void> {
    await this.writeResource(resource);
    await this.writeLookupTables(resource);
  }

  private async writeResource(resource: Resource): Promise<void> {
    const knex = getKnex();
    const resourceType = resource.resourceType;
    const meta = resource.meta as Meta;
    const content = JSON.stringify(resource);

    const columns: Record<string, any> = {
      id: resource.id,
      lastUpdated: meta.lastUpdated,
      content
    };

    const searchParams = getSearchParameters(resourceType);
    if (searchParams) {
      for (const searchParam of Object.values(searchParams)) {
        this.buildColumn(resource, columns, searchParam);
      }
    }

    await knex(resourceType).insert(columns).onConflict('id').merge();

    await knex(resourceType + '_History').insert({
      id: resource.id,
      versionId: meta.versionId,
      lastUpdated: meta.lastUpdated,
      content
    });
  }

  private buildColumn(resource: Resource, columns: Record<string, any>, searchParam: SearchParameter): void {
    if (this.isIndexTable(searchParam)) {
      return;
    }

    const name = searchParam.name as string;
    if (!(name in resource)) {
      return;
    }

    const value = (resource as any)[name];
    if (searchParam.type === 'date') {
      columns[name] = new Date(value);
    } else if (searchParam.type === 'boolean') {
      columns[name] = (value === 'true');
    } else if (typeof value === 'string') {
      if (value.length > 128) {
        columns[name] = value.substr(0, 128);
      } else {
        columns[name] = value;
      }
    } else {
      let json = JSON.stringify(value);
      if (json.length > 128) {
        json = json.substr(0, 128);
      }
      columns[name] = json;
    }
  }

  private async writeLookupTables(resource: Resource): Promise<void> {
    for (let i = 0; i < this.lookupTables.length; i++) {
      await this.lookupTables[i].indexResource(resource);
    }
  }

  private isIndexTable(searchParam: SearchParameter): boolean {
    return !!this.getLookupTable(searchParam);
  }

  private getLookupTable(searchParam: SearchParameter): LookupTable | undefined {
    for (const lookupTable of this.lookupTables) {
      if (lookupTable.isIndexed(searchParam)) {
        return lookupTable;
      }
    }
    return undefined;
  }
}

export const repo = new Repository();
