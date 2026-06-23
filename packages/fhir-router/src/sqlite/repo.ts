// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import type { CreateResourceOptions, UpdateResourceOptions } from '../repo.js';
import {
  AccessPolicyInteraction,
  badRequest,
  deepClone,
  generateId,
  notFound,
  OperationOutcomeError,
  preconditionFailed,
  stringify,
} from '@medplum/core';
import type { Bundle, Parameters, Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import { DatabaseSync } from 'node:sqlite';
import type { Operation } from 'rfc6902';
import { applyPatch } from 'rfc6902';
import { buildResourceRow } from '../indexing/row-builder.js';
import { serializeRowForDialect } from '../indexing/row-serializer.js';
import { lookupTables } from '../indexing/searchparameter.js';
import { SqlDialect } from '../sql/dialect.js';
import { SqliteConnection, type SqlConnection } from '../sql/connection.js';
import { DeleteQuery, InsertQuery, SelectQuery, UpdateQuery } from '../sql/sql.js';
import { FhirRepository, type RepositoryMode } from '../repo.js';
import { searchByReferenceImpl, searchImpl } from './search.js';
import type { SqliteSearchRepo } from './search-repo.js';
import { SqliteSchema } from './schema.js';

const RESOURCE_VERSION = 1;

export type SqliteRepositoryOptions = {
  readonly location?: string;
};

export class SqliteRepository extends FhirRepository implements SqliteSearchRepo {
  private readonly db: DatabaseSync;
  private readonly connection: SqliteConnection;
  private readonly schema: SqliteSchema;
  private seeding = false;
  private inTransaction = false;

  constructor(options?: SqliteRepositoryOptions) {
    super();
    this.db = new DatabaseSync(options?.location ?? ':memory:');
    this.connection = new SqliteConnection(this.db);
    this.schema = new SqliteSchema(this.db);
  }

  getSqlConnection(): SqlConnection {
    return this.connection;
  }

  addDeletedFilter(builder: SelectQuery): void {
    builder.where('deleted', '=', 0);
  }

  addSecurityFilters(_builder: SelectQuery, _resourceType: string, _interaction: AccessPolicyInteraction): void {
    // Mock repository does not enforce access policies.
  }

  removeHiddenFields(_resource: Resource): void {
    // Mock repository does not hide fields.
  }

  supportsInteraction(_interaction: AccessPolicyInteraction, _resourceType: string): boolean {
    return true;
  }

  supportsRangeSearch(): boolean {
    return true;
  }

  setMode(_mode: RepositoryMode): void {
    // SQLite mock repository ignores reader/writer mode.
  }

  clear(): void {
    const tables = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all() as { name: string }[];
    for (const { name } of tables) {
      this.db.exec(`DELETE FROM "${name}"`);
    }
  }

  async withSeeding<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.seeding) {
      return fn();
    }
    this.seeding = true;
    const result = await fn();
    this.seeding = false;
    return result;
  }

  async createResource<T extends Resource>(
    resource: T,
    options?: CreateResourceOptions,
    update = false
  ): Promise<WithId<T>> {
    const parsed = JSON.parse(stringify(resource)) as T;
    const result = {
      ...parsed,
      id: parsed.id ?? this.generateId(),
      meta: { ...(parsed.meta ?? {}) },
    } as WithId<T>;

    if (!this.seeding) {
      if (result.meta!.versionId) {
        delete result.meta!.versionId;
      }
      if (result.meta!.lastUpdated) {
        delete result.meta!.lastUpdated;
      }
    }

    result.meta!.versionId ??= generateId();
    result.meta!.lastUpdated ??= new Date().toISOString();

    const { resourceType, id } = result;
    this.schema.ensureResourceTable(resourceType as ResourceType);

    if (!update) {
      const existing = await this.tryReadResource(resourceType, id);
      if (existing) {
        throw new OperationOutcomeError(badRequest('Assigned ID is already in use'));
      }
    }

    const row = serializeRowForDialect(buildResourceRow(result, RESOURCE_VERSION), SqlDialect.SQLITE);
    row.deleted = 0;

    if (update) {
      const updateQuery = new UpdateQuery(resourceType);
      for (const [key, value] of Object.entries(row)) {
        if (key !== 'id') {
          updateQuery.set(key, value);
        }
      }
      updateQuery.where('id', '=', id);
      await updateQuery.execute(this.connection);
    } else {
      await new InsertQuery(resourceType, [row]).execute(this.connection);
    }

    await this.indexLookupTables(result, !update);
    await this.writeHistory(result);

    return deepClone(result);
  }

  generateId(): string {
    return generateId();
  }

  updateResource<T extends Resource>(resource: T, options?: UpdateResourceOptions): Promise<WithId<T>> {
    if (!resource.id) {
      throw new OperationOutcomeError(badRequest('Missing id'));
    }

    if (options?.ifMatch) {
      const existing = this.readResourceSync(resource.resourceType, resource.id);
      if (!existing) {
        throw new OperationOutcomeError(notFound);
      }
      if (existing.meta?.versionId !== options.ifMatch) {
        throw new OperationOutcomeError(preconditionFailed);
      }
    }

    return this.createResource(resource, undefined, true);
  }

  async patchResource<T extends Resource>(
    resourceType: T['resourceType'],
    id: string,
    patch: Operation[] | Parameters
  ): Promise<WithId<T>> {
    const resource = await this.readResource<T>(resourceType, id);

    try {
      if (Array.isArray(patch)) {
        const patchResult = applyPatch(resource, patch).filter(Boolean);
        if (patchResult.length > 0) {
          throw new OperationOutcomeError(badRequest(patchResult.map((e) => (e as Error).message).join('\n')));
        }
      } else {
        throw new Error('SqliteRepository does not support FHIRPath Patch');
      }
    } catch (err) {
      throw new OperationOutcomeError(err as any);
    }

    if (resource.meta) {
      delete resource.meta.versionId;
      delete resource.meta.lastUpdated;
    }

    return this.updateResource(resource);
  }

  async readResource<T extends Resource>(resourceType: string, id: string): Promise<T> {
    const resource = await this.tryReadResource<T>(resourceType, id);
    if (!resource) {
      throw new OperationOutcomeError(notFound);
    }
    return deepClone(resource);
  }

  async readReference<T extends Resource>(reference: Reference<T>): Promise<WithId<T>> {
    const parts = reference.reference?.split('/');
    if (parts?.length !== 2) {
      throw new OperationOutcomeError(badRequest('Invalid reference'));
    }
    return this.readResource(parts[0], parts[1]);
  }

  async readReferences<T extends Resource>(
    references: readonly Reference<T>[]
  ): Promise<(T | OperationOutcomeError)[]> {
    return Promise.all(
      references.map(async (r) => {
        try {
          return await this.readReference<T>(r);
        } catch (err) {
          return err as OperationOutcomeError;
        }
      })
    );
  }

  async readHistory<T extends Resource>(resourceType: string, id: string): Promise<Bundle<T>> {
    await this.readResource(resourceType, id);
    const rows = this.db
      .prepare(
        `SELECT content FROM "ResourceHistory" WHERE "resourceType" = ? AND "id" = ? ORDER BY "lastUpdated" DESC`
      )
      .all(resourceType, id) as { content: string }[];

    const entry = rows.map((row) => ({ resource: JSON.parse(row.content) as T }));
    return {
      resourceType: 'Bundle',
      type: 'history',
      ...(entry.length ? { entry } : undefined),
    };
  }

  async readVersion<T extends Resource>(resourceType: string, id: string, versionId: string): Promise<T> {
    await this.readResource(resourceType, id);
    const row = this.db
      .prepare(
        `SELECT content FROM "ResourceHistory" WHERE "resourceType" = ? AND "id" = ? AND "versionId" = ?`
      )
      .get(resourceType, id, versionId) as { content: string } | undefined;
    if (!row) {
      throw new OperationOutcomeError(notFound);
    }
    return JSON.parse(row.content) as T;
  }

  async search<T extends Resource>(searchRequest: SearchRequest<T>): Promise<Bundle<WithId<T>>> {
    return searchImpl(this, searchRequest);
  }

  async searchByReference<T extends Resource>(
    searchRequest: SearchRequest<T>,
    referenceField: string,
    references: string[]
  ): Promise<Record<string, WithId<T>[]>> {
    return searchByReferenceImpl(this, searchRequest, referenceField, references);
  }

  async deleteResource(resourceType: string, id: string): Promise<void> {
    const resource = await this.tryReadResource(resourceType, id);
    if (!resource) {
      throw new OperationOutcomeError(notFound);
    }

    await new DeleteQuery(resourceType).where('id', '=', id).execute(this.connection);
    for (const table of lookupTables) {
      await table.deleteValuesForResource(this.connection, resource);
    }
  }

  async withTransaction<TResult>(callback: (repo: this) => Promise<TResult>): Promise<TResult> {
    if (this.inTransaction) {
      return callback(this);
    }
    this.inTransaction = true;
    this.db.exec('BEGIN');
    try {
      const result = await callback(this);
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  close(): void {
    this.db.close();
  }

  private async tryReadResource<T extends Resource>(resourceType: string, id: string): Promise<WithId<T> | undefined> {
    this.schema.ensureResourceTable(resourceType as ResourceType);
    const rows = await new SelectQuery(resourceType)
      .column('content')
      .where('id', '=', id)
      .where('deleted', '=', 0)
      .execute(this.connection);
    if (!rows.length) {
      return undefined;
    }
    return JSON.parse(rows[0].content) as WithId<T>;
  }

  private readResourceSync<T extends Resource>(resourceType: string, id: string): WithId<T> | undefined {
    this.schema.ensureResourceTable(resourceType as ResourceType);
    const row = this.db
      .prepare(`SELECT content FROM "${resourceType}" WHERE id = ? AND deleted = 0`)
      .get(id) as { content: string } | undefined;
    return row ? (JSON.parse(row.content) as WithId<T>) : undefined;
  }

  private async writeHistory(resource: WithId<Resource>): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO "ResourceHistory" ("resourceType", "id", "versionId", "lastUpdated", "content") VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        resource.resourceType,
        resource.id,
        resource.meta?.versionId ?? '',
        resource.meta?.lastUpdated ?? new Date().toISOString(),
        stringify(resource)
      );
  }

  private async indexLookupTables(resource: WithId<Resource>, create: boolean): Promise<void> {
    this.schema.ensureReferenceTable(resource.resourceType);
    for (const lookupTable of lookupTables) {
      await lookupTable.indexResource(this.connection, resource, create);
    }
  }
}
