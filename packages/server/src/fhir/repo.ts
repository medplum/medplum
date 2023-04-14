import {
  allOk,
  badRequest,
  deepEquals,
  DEFAULT_SEARCH_COUNT,
  evalFhirPath,
  evalFhirPathTyped,
  FhirFilterComparison,
  FhirFilterConnective,
  FhirFilterExpression,
  FhirFilterNegation,
  Filter,
  forbidden,
  formatSearchQuery,
  getReferenceString,
  getSearchParameterDetails,
  getStatus,
  gone,
  isGone,
  isNotFound,
  isOk,
  isResource,
  matchesSearchRequest,
  normalizeErrorString,
  normalizeOperationOutcome,
  notFound,
  OperationOutcomeError,
  Operator as FhirOperator,
  parseFilterParameter,
  parseSearchUrl,
  PropertyType,
  resolveId,
  SearchParameterDetails,
  SearchParameterType,
  SearchRequest,
  SortRule,
  stringify,
  tooManyRequests,
  toTypedValue,
  validateResource,
  validateResourceType,
} from '@medplum/core';
import { BaseRepository, FhirRepository } from '@medplum/fhir-router';
import {
  AccessPolicy,
  AccessPolicyResource,
  Bundle,
  BundleEntry,
  BundleLink,
  Meta,
  OperationOutcome,
  Reference,
  Resource,
  ResourceType,
  SearchParameter,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { applyPatch, Operation } from 'rfc6902';
import { URL } from 'url';
import validator from 'validator';
import { getConfig } from '../config';
import { getClient } from '../database';
import { logger } from '../logger';
import { getRedis } from '../redis';
import {
  AuditEventOutcome,
  AuditEventSubtype,
  CreateInteraction,
  DeleteInteraction,
  HistoryInteraction,
  logRestfulEvent,
  PatchInteraction,
  ReadInteraction,
  SearchInteraction,
  UpdateInteraction,
  VreadInteraction,
} from '../util/auditevent';
import { addBackgroundJobs } from '../workers';
import { addSubscriptionJobs } from '../workers/subscription';
import { validateResourceWithJsonSchema } from './jsonschema';
import { AddressTable } from './lookups/address';
import { HumanNameTable } from './lookups/humanname';
import { LookupTable } from './lookups/lookuptable';
import { TokenTable } from './lookups/token';
import { deriveIdentifierSearchParameter } from './lookups/util';
import { ValueSetElementTable } from './lookups/valuesetelement';
import { getPatient } from './patient';
import { validateReferences } from './references';
import { rewriteAttachments, RewriteMode } from './rewrite';
import {
  Column,
  Condition,
  Conjunction,
  DeleteQuery,
  Disjunction,
  Expression,
  InsertQuery,
  Negation,
  Operator,
  SelectQuery,
} from './sql';
import { getSearchParameter, getSearchParameters } from './structure';

/**
 * The RepositoryContext interface defines standard metadata for repository actions.
 * In practice, there will be one Repository per HTTP request.
 * And the RepositoryContext represents the context of that request,
 * such as "who is the current user?" and "what is the current project?"
 */
export interface RepositoryContext {
  /**
   * The current author reference.
   * This should be a FHIR reference string (i.e., "resourceType/id").
   * Where resource type is ClientApplication, Patient, Practitioner, etc.
   * This value will be included in every resource as meta.author.
   */
  author: Reference;

  remoteAddress?: string;

  /**
   * The current project reference.
   * This should be the ID/UUID of the current project.
   * This value will be included in every resource as meta.project.
   */
  project?: string;

  /**
   * Optional compartment restriction.
   * If the compartments array is provided,
   * all queries will be restricted to those compartments.
   */
  accessPolicy?: AccessPolicy;

  /**
   * Optional flag for system administrators,
   * which grants system-level access.
   */
  superAdmin?: boolean;

  /**
   * Optional flag for project administrators,
   * which grants additional project-level access.
   */
  projectAdmin?: boolean;

  /**
   * Optional flag to validate resources in strict mode.
   * Strict mode validates resources against StructureDefinition resources,
   * which includes strict date validation, backbone elements, and more.
   * Non-strict mode uses the official FHIR JSONSchema definition, which is
   * significantly more relaxed.
   */
  strictMode?: boolean;

  /**
   * Optional flag to validate references on write operations.
   * If enabled, the repository will check that all references are valid,
   * and that the current user has access to the referenced resource.
   */
  checkReferencesOnWrite?: boolean;

  /**
   * Optional flag to include Medplum extended meta fields.
   * Medplum tracks additional metadata for each resource, such as:
   * 1) "author" - Reference to the last user who modified the resource.
   * 2) "project" - Reference to the project that owns the resource.
   * 3) "account" - Optional reference to a subaccount that owns the resource.
   */
  extendedMode?: boolean;
}

export interface CacheEntry<T extends Resource = Resource> {
  resource: T;
  projectId: string;
}

/**
 * Public resource types are in the "public" project.
 * They are available to all users.
 */
const publicResourceTypes = [
  'CapabilityStatement',
  'CompartmentDefinition',
  'ImplementationGuide',
  'OperationDefinition',
  'SearchParameter',
  'StructureDefinition',
];

/**
 * Protected resource types are in the "medplum" project.
 * Reading and writing is limited to the system account.
 */
const protectedResourceTypes = ['DomainConfiguration', 'JsonWebKey', 'Login', 'User'];

/**
 * Project admin resource types are special resources that are only
 * accessible to project administrators.
 */
export const projectAdminResourceTypes = ['PasswordChangeRequest', 'Project', 'ProjectMembership'];

/**
 * The lookup tables array includes a list of special tables for search indexing.
 */
const lookupTables: LookupTable<unknown>[] = [
  new AddressTable(),
  new HumanNameTable(),
  new TokenTable(),
  new ValueSetElementTable(),
];

/**
 * Defines the maximum number of resources returned in a single search result.
 */
const maxSearchResults = 1000;

/**
 * The Repository class manages reading and writing to the FHIR repository.
 * It is a thin layer on top of the database.
 * Repository instances should be created per author and project.
 */
export class Repository extends BaseRepository implements FhirRepository {
  private readonly context: RepositoryContext;

  constructor(context: RepositoryContext) {
    super();
    this.context = context;
    if (!this.context.author?.reference) {
      throw new Error('Invalid author reference');
    }
  }

  async createResource<T extends Resource>(resource: T): Promise<T> {
    try {
      const result = await this.updateResourceImpl(
        {
          ...resource,
          id: randomUUID(),
        },
        true
      );
      this.logEvent(CreateInteraction, AuditEventOutcome.Success, undefined, result);
      return result;
    } catch (err) {
      this.logEvent(CreateInteraction, AuditEventOutcome.MinorFailure, err);
      throw err;
    }
  }

  async readResource<T extends Resource>(resourceType: string, id: string): Promise<T> {
    try {
      const result = this.removeHiddenFields(await this.readResourceImpl<T>(resourceType, id));
      this.logEvent(ReadInteraction, AuditEventOutcome.Success, undefined, result);
      return result;
    } catch (err) {
      this.logEvent(ReadInteraction, AuditEventOutcome.MinorFailure, err);
      throw err;
    }
  }

  private async readResourceImpl<T extends Resource>(resourceType: string, id: string): Promise<T> {
    if (!id || !validator.isUUID(id)) {
      throw new OperationOutcomeError(notFound);
    }

    validateResourceType(resourceType);

    if (!this.canReadResourceType(resourceType)) {
      throw new OperationOutcomeError(forbidden);
    }

    const cacheRecord = await getCacheEntry<T>(resourceType, id);
    if (cacheRecord) {
      // This is an optimization to avoid a database query.
      // However, it depends on all values in the cache having "meta.compartment"
      // Old versions of Medplum did not populate "meta.compartment"
      // So this optimization is blocked until we add a migration.
      // if (!this.canReadCacheEntry(cacheRecord)) {
      //   throw new OperationOutcomeError(notFound);
      // }
      if (this.canReadCacheEntry(cacheRecord)) {
        return cacheRecord.resource;
      }
    }

    return this.readResourceFromDatabase(resourceType, id);
  }

  private async readResourceFromDatabase<T extends Resource>(resourceType: string, id: string): Promise<T> {
    const client = getClient();
    const builder = new SelectQuery(resourceType).column('content').column('deleted').where('id', Operator.EQUALS, id);

    this.addSecurityFilters(builder, resourceType);

    const rows = await builder.execute(client);
    if (rows.length === 0) {
      throw new OperationOutcomeError(notFound);
    }

    if (rows[0].deleted) {
      throw new OperationOutcomeError(gone);
    }

    const resource = JSON.parse(rows[0].content as string) as T;
    await setCacheEntry(resource);
    return resource;
  }

  private canReadCacheEntry(cacheEntry: CacheEntry): boolean {
    if (
      !this.isSuperAdmin() &&
      this.context.project !== undefined &&
      cacheEntry.projectId !== undefined &&
      cacheEntry.projectId !== this.context.project
    ) {
      return false;
    }
    if (!this.matchesAccessPolicy(cacheEntry.resource, true)) {
      return false;
    }
    return true;
  }

  async readReferences(references: Reference[]): Promise<(Resource | Error)[]> {
    const cacheEntries = await getCacheEntries(references);
    const result: (Resource | Error)[] = new Array(references.length);

    for (let i = 0; i < result.length; i++) {
      const reference = references[i];
      const cacheEntry = cacheEntries[i];
      let entryResult = await this.processReadReferenceEntry(reference, cacheEntry);
      if (entryResult instanceof Error) {
        this.logEvent(ReadInteraction, AuditEventOutcome.MinorFailure, entryResult);
      } else {
        entryResult = this.removeHiddenFields(entryResult);
        this.logEvent(ReadInteraction, AuditEventOutcome.Success, undefined, entryResult);
      }
      result[i] = entryResult;
    }

    return result;
  }

  private async processReadReferenceEntry(
    reference: Reference,
    cacheEntry: CacheEntry | undefined
  ): Promise<Resource | Error> {
    try {
      const [resourceType, id] = reference.reference?.split('/') as [ResourceType, string];
      validateResourceType(resourceType);

      if (!this.canReadResourceType(resourceType)) {
        return new OperationOutcomeError(forbidden);
      }

      if (cacheEntry) {
        if (!this.canReadCacheEntry(cacheEntry)) {
          return new OperationOutcomeError(notFound);
        }
        return cacheEntry.resource;
      }
      return await this.readResourceFromDatabase(resourceType, id);
    } catch (err) {
      if (err instanceof OperationOutcomeError) {
        return err;
      }
      return new OperationOutcomeError(normalizeOperationOutcome(err), err);
    }
  }

  async readReference<T extends Resource>(reference: Reference<T>): Promise<T> {
    const parts = reference.reference?.split('/');
    if (!parts || parts.length !== 2) {
      throw new OperationOutcomeError(badRequest('Invalid reference'));
    }
    return this.readResource(parts[0], parts[1]);
  }

  /**
   * Returns resource history.
   *
   * Results are sorted with oldest versions last
   *
   * See: https://www.hl7.org/fhir/http.html#history
   *
   * @param resourceType The FHIR resource type.
   * @param id The FHIR resource ID.
   * @returns Operation outcome and a history bundle.
   */
  async readHistory<T extends Resource>(resourceType: string, id: string): Promise<Bundle<T>> {
    try {
      let resource: T | undefined = undefined;
      try {
        resource = await this.readResourceImpl<T>(resourceType, id);
      } catch (err) {
        if (!(err instanceof OperationOutcomeError) || !isGone(err.outcome)) {
          throw err;
        }
      }

      const client = getClient();
      const rows = await new SelectQuery(resourceType + '_History')
        .column('versionId')
        .column('id')
        .column('content')
        .column('lastUpdated')
        .where('id', Operator.EQUALS, id)
        .orderBy('lastUpdated', true)
        .limit(100)
        .execute(client);

      const entries: BundleEntry<T>[] = [];

      for (const row of rows) {
        const resource = row.content ? this.removeHiddenFields(JSON.parse(row.content as string)) : undefined;
        const outcome: OperationOutcome = row.content
          ? allOk
          : {
              resourceType: 'OperationOutcome',
              id: 'gone',
              issue: [
                {
                  severity: 'error',
                  code: 'deleted',
                  details: {
                    text: 'Deleted on ' + row.lastUpdated,
                  },
                },
              ],
            };
        entries.push({
          fullUrl: this.getFullUrl(resourceType, row.id),
          request: {
            method: 'GET',
            url: `${resourceType}/${row.id}/_history/${row.versionId}`,
          },
          response: {
            status: getStatus(outcome).toString(),
            outcome,
          },
          resource,
        });
      }

      this.logEvent(HistoryInteraction, AuditEventOutcome.Success, undefined, resource);
      return {
        resourceType: 'Bundle',
        type: 'history',
        entry: entries,
      };
    } catch (err) {
      this.logEvent(HistoryInteraction, AuditEventOutcome.MinorFailure, err);
      throw err;
    }
  }

  async readVersion<T extends Resource>(resourceType: string, id: string, vid: string): Promise<T> {
    try {
      if (!validator.isUUID(vid)) {
        throw new OperationOutcomeError(notFound);
      }

      await this.readResourceImpl<T>(resourceType, id);

      const client = getClient();
      const rows = await new SelectQuery(resourceType + '_History')
        .column('content')
        .where('id', Operator.EQUALS, id)
        .where('versionId', Operator.EQUALS, vid)
        .execute(client);

      if (rows.length === 0) {
        throw new OperationOutcomeError(notFound);
      }

      const result = this.removeHiddenFields(JSON.parse(rows[0].content as string));
      this.logEvent(VreadInteraction, AuditEventOutcome.Success, undefined, result);
      return result;
    } catch (err) {
      this.logEvent(VreadInteraction, AuditEventOutcome.MinorFailure, err);
      throw err;
    }
  }

  async updateResource<T extends Resource>(resource: T): Promise<T> {
    try {
      const result = await this.updateResourceImpl(resource, false);
      this.logEvent(UpdateInteraction, AuditEventOutcome.Success, undefined, result);
      return result;
    } catch (err) {
      this.logEvent(UpdateInteraction, AuditEventOutcome.MinorFailure, err);
      throw err;
    }
  }

  private async updateResourceImpl<T extends Resource>(resource: T, create: boolean): Promise<T> {
    if (this.context.strictMode) {
      validateResource(resource);
    } else {
      validateResourceWithJsonSchema(resource);
    }

    if (this.context.checkReferencesOnWrite) {
      await validateReferences(this, resource);
    }

    const { resourceType, id } = resource;
    if (!id) {
      throw new OperationOutcomeError(badRequest('Missing id'));
    }

    if (!this.canWriteResourceType(resourceType)) {
      throw new OperationOutcomeError(forbidden);
    }

    const existing = await this.checkExistingResource<T>(resourceType, id, create);

    if (await this.isTooManyVersions(resourceType, id, create)) {
      throw new OperationOutcomeError(tooManyRequests);
    }

    if (existing) {
      (existing.meta as Meta).compartment = this.getCompartments(existing);

      if (!this.canWriteResource(existing)) {
        // Check before the update
        throw new OperationOutcomeError(forbidden);
      }
    }

    const updated = await rewriteAttachments<T>(RewriteMode.REFERENCE, this, {
      ...this.restoreReadonlyFields(resource, existing),
      meta: {
        ...existing?.meta,
        ...resource.meta,
      },
    });

    const resultMeta = {
      ...updated?.meta,
      versionId: randomUUID(),
      lastUpdated: this.getLastUpdated(existing, resource),
      author: this.getAuthor(resource),
    };

    const result: T = { ...updated, meta: resultMeta };

    const project = this.getProjectId(updated);
    if (project) {
      resultMeta.project = project;
    }

    const account = await this.getAccount(existing, updated, create);
    if (account) {
      resultMeta.account = account;
    }

    resultMeta.compartment = this.getCompartments(result);

    if (this.isNotModified(existing, result)) {
      return existing as T;
    }

    if (!this.canWriteResource(result)) {
      // Check after the update
      throw new OperationOutcomeError(forbidden);
    }

    if (!this.isCacheOnly(result)) {
      await this.writeToDatabase(result);
    }

    await setCacheEntry(result);
    await addBackgroundJobs(result, { interaction: create ? 'create' : 'update' });
    this.removeHiddenFields(result);
    return result;
  }

  /**
   * Writes the resource to the database.
   * This is a single atomic operation inside of a transaction.
   * @param resource The resource to write to the database.
   */
  private async writeToDatabase<T extends Resource>(resource: T): Promise<void> {
    // Note: We don't try/catch this because if connecting throws an exception.
    // We don't need to dispose of the client (it will be undefined).
    // https://node-postgres.com/features/transactions
    const client = await getClient().connect();
    try {
      await client.query('BEGIN');
      await this.writeResource(client, resource);
      await this.writeResourceVersion(client, resource);
      await this.writeLookupTables(client, resource);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Tries to return the existing resource, if it is available.
   * Handles the following cases:
   *  - Previous version exists
   *  - Previous version was deleted, and user is restoring it
   *  - Previous version does not exist, and user does not have permission to create by ID
   *  - Previous version does not exist, and user does have permission to create by ID
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @returns The existing resource, if found.
   */
  private async checkExistingResource<T extends Resource>(
    resourceType: string,
    id: string,
    create: boolean
  ): Promise<T | undefined> {
    try {
      return await this.readResourceImpl<T>(resourceType, id);
    } catch (err) {
      const outcome = normalizeOperationOutcome(err);
      if (!isOk(outcome) && !isNotFound(outcome) && !isGone(outcome)) {
        throw new OperationOutcomeError(outcome, err);
      }

      if (!create && isNotFound(outcome) && !this.canSetId()) {
        throw new OperationOutcomeError(outcome, err);
      }

      // Otherwise, it is ok if the resource is not found.
      // This is an "update" operation, and the outcome is "not-found" or "gone",
      // and the current user has permission to create a new version.
      return undefined;
    }
  }

  /**
   * Returns true if the resource has too many versions within the specified time period.
   * @param resourceType The resource type.
   * @param id The resource ID.
   * @param create If true, then the resource is being created.
   * @returns True if the resource has too many versions within the specified time period.
   */
  private async isTooManyVersions(resourceType: string, id: string, create: boolean): Promise<boolean> {
    if (create) {
      return false;
    }
    const seconds = 60;
    const maxVersions = 10;
    const client = getClient();
    const rows = await new SelectQuery(resourceType + '_History')
      .raw(`COUNT (DISTINCT "versionId")::int AS "count"`)
      .where('id', Operator.EQUALS, id)
      .where('lastUpdated', Operator.GREATER_THAN, new Date(Date.now() - 1000 * seconds))
      .execute(client);
    return (rows[0].count as number) >= maxVersions;
  }

  /**
   * Returns true if the resource is not modified from the existing resource.
   * @param existing The existing resource.
   * @param updated The updated resource.
   * @returns True if the resource is not modified.
   */
  private isNotModified(existing: Resource | undefined, updated: Resource): boolean {
    if (!existing) {
      return false;
    }

    // When stricter FHIR validation is enabled, then this can be removed.
    // At present, there are some cases where a server accepts "empty" values that escape the deep equals.
    const cleanExisting = JSON.parse(stringify(existing));
    const cleanUpdated = JSON.parse(stringify(updated));
    return deepEquals(cleanExisting, cleanUpdated);
  }

  /**
   * Rebuilds compartments for all resources of the specified type.
   * This is only available to super admins.
   * @param resourceType The resource type.
   */
  async rebuildCompartmentsForResourceType(resourceType: string): Promise<void> {
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    const client = getClient();
    const builder = new SelectQuery(resourceType).column({ tableName: resourceType, columnName: 'content' });
    this.addDeletedFilter(builder);

    await builder.executeCursor(client, async (row: any) => {
      try {
        const resource = JSON.parse(row.content) as Resource;
        (resource.meta as Meta).compartment = this.getCompartments(resource);
        await this.updateResourceImpl(JSON.parse(row.content) as Resource, false);
      } catch (err) {
        logger.error('Failed to rebuild compartments for resource', normalizeErrorString(err));
      }
    });
  }

  /**
   * Reindexes all resources of the specified type.
   * This is only available to the system account.
   * This should not result in any change to resources or history.
   * @param resourceType The resource type.
   */
  async reindexResourceType(resourceType: string): Promise<void> {
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    const client = getClient();
    const builder = new SelectQuery(resourceType).column({ tableName: resourceType, columnName: 'content' });
    this.addDeletedFilter(builder);

    await builder.executeCursor(client, async (row: any) => {
      try {
        await this.reindexResourceImpl(JSON.parse(row.content) as Resource);
      } catch (err) {
        logger.error('Failed to reindex resource', normalizeErrorString(err));
      }
    });
  }

  /**
   * Reindexes the resource.
   * This is only available to the system and super admin accounts.
   * This should not result in any change to the resource or its history.
   * @param resourceType The resource type.
   * @param id The resource ID.
   */
  async reindexResource<T extends Resource>(resourceType: string, id: string): Promise<void> {
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    const resource = await this.readResourceImpl<T>(resourceType, id);
    return this.reindexResourceImpl(resource);
  }

  /**
   * Internal implementation of reindexing a resource.
   * This accepts a resource as a parameter, rather than a resource type and ID.
   * When doing a bulk reindex, this will be more efficient because it avoids unnecessary reads.
   * @param resource The resource.
   * @returns The reindexed resource.
   */
  private async reindexResourceImpl<T extends Resource>(resource: T): Promise<void> {
    (resource.meta as Meta).compartment = this.getCompartments(resource);

    // Note: We don't try/catch this because if connecting throws an exception.
    // We don't need to dispose of the client (it will be undefined).
    // https://node-postgres.com/features/transactions
    const client = await getClient().connect();
    try {
      await client.query('BEGIN');
      await this.writeResource(client, resource);
      await this.writeLookupTables(client, resource);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Resends subscriptions for the resource.
   * This is only available to the admin accounts.
   * This should not result in any change to the resource or its history.
   * @param resourceType The resource type.
   * @param id The resource ID.
   */
  async resendSubscriptions<T extends Resource>(resourceType: string, id: string): Promise<void> {
    if (!this.isSuperAdmin() && !this.isProjectAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    const resource = await this.readResourceImpl<T>(resourceType, id);
    return addSubscriptionJobs(resource, { interaction: 'update' });
  }

  async deleteResource(resourceType: string, id: string): Promise<void> {
    try {
      const resource = await this.readResourceImpl(resourceType, id);

      if (!this.canWriteResourceType(resourceType)) {
        throw new OperationOutcomeError(forbidden);
      }

      await deleteCacheEntry(resourceType, id);

      const client = getClient();
      const lastUpdated = new Date();
      const content = '';
      const columns: Record<string, any> = {
        id,
        lastUpdated,
        deleted: true,
        compartments: this.getCompartments(resource).map((ref) => resolveId(ref)),
        content,
      };

      await new InsertQuery(resourceType, [columns]).mergeOnConflict(true).execute(client);

      await new InsertQuery(resourceType + '_History', [
        {
          id,
          versionId: randomUUID(),
          lastUpdated,
          content,
        },
      ]).execute(client);

      await this.deleteFromLookupTables(client, resource);
      this.logEvent(DeleteInteraction, AuditEventOutcome.Success, undefined, resource);
    } catch (err) {
      this.logEvent(DeleteInteraction, AuditEventOutcome.MinorFailure, err);
      throw err;
    }
  }

  async patchResource(resourceType: string, id: string, patch: Operation[]): Promise<Resource> {
    try {
      const resource = await this.readResourceImpl(resourceType, id);

      try {
        const patchResult = applyPatch(resource, patch).filter(Boolean);
        if (patchResult.length > 0) {
          throw new OperationOutcomeError(badRequest(patchResult.map((e) => (e as Error).message).join('\n')));
        }
      } catch (err) {
        throw new OperationOutcomeError(normalizeOperationOutcome(err));
      }

      const result = await this.updateResourceImpl(resource, false);
      this.logEvent(PatchInteraction, AuditEventOutcome.Success, undefined, result);
      return result;
    } catch (err) {
      this.logEvent(PatchInteraction, AuditEventOutcome.MinorFailure, err);
      throw err;
    }
  }

  /**
   * Permanently deletes the specified resource and all of its history.
   * This is only available to the system and super admin accounts.
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   */
  async expungeResource(resourceType: string, id: string): Promise<void> {
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }
    await new DeleteQuery(resourceType).where('id', Operator.EQUALS, id).execute(getClient());
    await new DeleteQuery(resourceType + '_History').where('id', Operator.EQUALS, id).execute(getClient());
    await deleteCacheEntry(resourceType, id);
  }

  /**
   * Permanently deletes the specified resources and all of its history.
   * This is only available to the system and super admin accounts.
   * @param resourceType The FHIR resource type.
   * @param ids The resource IDs.
   */
  async expungeResources(resourceType: string, ids: string[]): Promise<void> {
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }
    await new DeleteQuery(resourceType).where('id', Operator.IN, ids).execute(getClient());
    await new DeleteQuery(resourceType + '_History').where('id', Operator.IN, ids).execute(getClient());
    await deleteCacheEntries(resourceType, ids);
  }

  /**
   * Purges resources of the specified type that were last updated before the specified date.
   * This is only available to the system and super admin accounts.
   * @param resourceType The FHIR resource type.
   * @param before The date before which resources should be purged.
   */
  async purgeResources(resourceType: ResourceType, before: string): Promise<void> {
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }
    await new DeleteQuery(resourceType).where('lastUpdated', Operator.LESS_THAN_OR_EQUALS, before).execute(getClient());
    await new DeleteQuery(resourceType + '_History')
      .where('lastUpdated', Operator.LESS_THAN_OR_EQUALS, before)
      .execute(getClient());
  }

  async search<T extends Resource>(searchRequest: SearchRequest): Promise<Bundle<T>> {
    try {
      const resourceType = searchRequest.resourceType;
      validateResourceType(resourceType);

      if (!this.canReadResourceType(resourceType)) {
        throw new OperationOutcomeError(forbidden);
      }

      // Ensure that "count" is set.
      // Count is an optional field.  From this point on, it is safe to assume it is a number.
      if (searchRequest.count === undefined) {
        searchRequest.count = DEFAULT_SEARCH_COUNT;
      } else if (searchRequest.count > maxSearchResults) {
        searchRequest.count = maxSearchResults;
      }

      let entry = undefined;
      let hasMore = false;
      if (searchRequest.count > 0) {
        ({ entry, hasMore } = await this.getSearchEntries<T>(searchRequest));
      }

      let total = undefined;
      if (searchRequest.total === 'estimate' || searchRequest.total === 'accurate') {
        total = await this.getTotalCount(searchRequest);
      }

      this.logEvent(SearchInteraction, AuditEventOutcome.Success, undefined, undefined, searchRequest);
      return {
        resourceType: 'Bundle',
        type: 'searchset',
        entry,
        total,
        link: this.getSearchLinks(searchRequest, hasMore),
      };
    } catch (err) {
      this.logEvent(SearchInteraction, AuditEventOutcome.MinorFailure, err, undefined, searchRequest);
      throw err;
    }
  }

  /**
   * Returns the bundle entries for a search request.
   * @param searchRequest The search request.
   * @returns The bundle entries for the search result.
   */
  private async getSearchEntries<T extends Resource>(
    searchRequest: SearchRequest
  ): Promise<{ entry: BundleEntry<T>[]; hasMore: boolean }> {
    const resourceType = searchRequest.resourceType;
    const client = getClient();
    const builder = new SelectQuery(resourceType)
      .column({ tableName: resourceType, columnName: 'id' })
      .column({ tableName: resourceType, columnName: 'content' });

    this.addSortRules(builder, searchRequest);
    this.addDeletedFilter(builder);
    this.addSecurityFilters(builder, resourceType);
    this.addSearchFilters(builder, searchRequest);

    if (builder.joins.length > 0) {
      builder.groupBy({ tableName: resourceType, columnName: 'id' });
    }

    const count = searchRequest.count as number;
    builder.limit(count + 1); // Request one extra to test if there are more results
    builder.offset(searchRequest.offset || 0);

    const rows = await builder.execute(client);
    const resources = rows.slice(0, count).map((row) => JSON.parse(row.content as string)) as T[];
    const entries = resources.map(
      (resource) =>
        ({
          fullUrl: this.getFullUrl(resourceType, resource.id as string),
          resource,
        } as BundleEntry)
    );

    if (searchRequest.include) {
      entries.push(...(await this.getSearchIncludeEntries(searchRequest.include, resources)));
    }

    if (searchRequest.revInclude) {
      entries.push(...(await this.getSearchRevIncludeEntries(searchRequest.revInclude, resources)));
    }

    for (const entry of entries) {
      this.removeHiddenFields(entry.resource as Resource);
    }

    return {
      entry: entries as BundleEntry<T>[],
      hasMore: rows.length > count,
    };
  }

  /**
   * Returns bundle entries for the resources that are included in the search result.
   *
   * See documentation on _include: https://hl7.org/fhir/R4/search.html#include
   *
   * @param include The include parameter.
   * @param resources The base search result resources.
   * @returns The bundle entries for the included resources.
   */
  private async getSearchIncludeEntries(include: string, resources: Resource[]): Promise<BundleEntry[]> {
    const [nestedResourceType, nested] = include.split(':');
    const searchParam = getSearchParameter(nestedResourceType, nested);
    if (!searchParam) {
      throw new OperationOutcomeError(badRequest(`Invalid include parameter: ${include}`));
    }

    const fhirPathResult = evalFhirPathTyped(searchParam.expression as string, resources.map(toTypedValue));

    const references = fhirPathResult
      .filter((typedValue) => typedValue.type === PropertyType.Reference)
      .map((typedValue) => typedValue.value as Reference);

    const readResult = await this.readReferences(references);

    const includedResources = readResult.filter((e) => isResource(e as Resource | undefined)) as Resource[];

    return includedResources.map(
      (resource: Resource) =>
        ({
          fullUrl: this.getFullUrl(resource.resourceType, resource.id as string),
          resource,
        } as BundleEntry)
    ) as BundleEntry[];
  }

  /**
   * Returns bundle entries for the resources that are reverse included in the search result.
   *
   * See documentation on _revinclude: https://hl7.org/fhir/R4/search.html#revinclude
   *
   * @param revInclude The revInclude parameter.
   * @param resources The base search result resources.
   * @returns The bundle entries for the reverse included resources.
   */
  private async getSearchRevIncludeEntries(revInclude: string, resources: Resource[]): Promise<BundleEntry[]> {
    const [nestedResourceType, nested] = revInclude.split(':');
    const nestedSearchRequest: SearchRequest = {
      resourceType: nestedResourceType as ResourceType,
      filters: [
        {
          code: nested,
          operator: FhirOperator.EQUALS,
          value: resources.map(getReferenceString).join(','),
        },
      ],
    };

    return (await this.getSearchEntries(nestedSearchRequest)).entry;
  }

  /**
   * Returns the search bundle links for a search request.
   * At minimum, the 'self' link will be returned.
   * If "count" does not equal zero, then 'first', 'next', and 'previous' links will be included.
   * @param searchRequest The search request.
   * @param hasMore True if there are more entries after the current page.
   * @returns The search bundle links.
   */
  private getSearchLinks(searchRequest: SearchRequest, hasMore: boolean | undefined): BundleLink[] {
    const result: BundleLink[] = [
      {
        relation: 'self',
        url: this.getSearchUrl(searchRequest),
      },
    ];

    const count = searchRequest.count as number;
    if (count > 0) {
      const offset = searchRequest.offset || 0;

      result.push({
        relation: 'first',
        url: this.getSearchUrl({ ...searchRequest, offset: 0 }),
      });

      if (hasMore) {
        result.push({
          relation: 'next',
          url: this.getSearchUrl({ ...searchRequest, offset: offset + count }),
        });
      }

      if (offset > 0) {
        result.push({
          relation: 'previous',
          url: this.getSearchUrl({ ...searchRequest, offset: offset - count }),
        });
      }
    }

    return result;
  }

  private getFullUrl(resourceType: string, id: string): string {
    return `${getConfig().baseUrl}fhir/R4/${resourceType}/${id}`;
  }

  private getSearchUrl(searchRequest: SearchRequest): string {
    return `${getConfig().baseUrl}fhir/R4/${searchRequest.resourceType}${formatSearchQuery(searchRequest)}`;
  }

  /**
   * Returns the total number of matching results for a search request.
   * This ignores page number and page size.
   * @param searchRequest The search request.
   * @returns The total number of matching results.
   */
  private async getTotalCount(searchRequest: SearchRequest): Promise<number> {
    const client = getClient();
    const builder = new SelectQuery(searchRequest.resourceType);
    this.addDeletedFilter(builder);
    this.addSecurityFilters(builder, searchRequest.resourceType);
    this.addSearchFilters(builder, searchRequest);

    if (builder.joins.length > 0) {
      builder.raw(`COUNT (DISTINCT "${searchRequest.resourceType}"."id")::int AS "count"`);
    } else {
      builder.raw('COUNT("id")::int AS "count"');
    }

    const rows = await builder.execute(client);
    return rows[0].count as number;
  }

  /**
   * Adds filters to ignore soft-deleted resources.
   * @param builder The select query builder.
   */
  private addDeletedFilter(builder: SelectQuery): void {
    builder.where('deleted', Operator.EQUALS, false);
  }

  /**
   * Adds security filters to the select query.
   * @param builder The select query builder.
   * @param resourceType The resource type for compartments.
   */
  private addSecurityFilters(builder: SelectQuery, resourceType: string): void {
    if (publicResourceTypes.includes(resourceType)) {
      // No compartment restrictions for public resources.
      return;
    }

    if (this.isSuperAdmin()) {
      // No compartment restrictions for admins.
      return;
    }

    this.addProjectFilter(builder);
    this.addAccessPolicyFilters(builder, resourceType);
  }

  /**
   * Adds the "project" filter to the select query.
   * @param builder The select query builder.
   */
  private addProjectFilter(builder: SelectQuery): void {
    if (this.context.project) {
      builder.where('compartments', Operator.ARRAY_CONTAINS, [this.context.project], 'UUID[]');
    }
  }

  /**
   * Adds access policy filters to the select query.
   * @param builder The select query builder.
   * @param resourceType The resource type being searched.
   */
  private addAccessPolicyFilters(builder: SelectQuery, resourceType: string): void {
    if (!this.context.accessPolicy?.resource) {
      return;
    }

    const expressions: Expression[] = [];

    for (const policy of this.context.accessPolicy.resource) {
      if (policy.resourceType === resourceType) {
        const policyCompartmentId = resolveId(policy.compartment);
        if (policyCompartmentId) {
          // Deprecated - to be removed
          // Add compartment restriction for the access policy.
          expressions.push(new Condition('compartments', Operator.ARRAY_CONTAINS, [policyCompartmentId], 'UUID[]'));
        } else if (policy.criteria) {
          // Add subquery for access policy criteria.
          const searchRequest = this.parseCriteriaAsSearchRequest(policy.criteria);
          const accessPolicyExpression = this.buildSearchExpression(builder, searchRequest);
          if (accessPolicyExpression) {
            expressions.push(accessPolicyExpression);
          }
        } else {
          // Allow access to all resources in the compartment.
          return;
        }
      }
    }

    if (expressions.length > 0) {
      builder.predicate.expressions.push(new Disjunction(expressions));
    }
  }

  /**
   * Adds all search filters as "WHERE" clauses to the query builder.
   * @param selectQuery The select query builder.
   * @param predicate The predicate conjunction.
   * @param searchRequest The search request.
   */
  private addSearchFilters(selectQuery: SelectQuery, searchRequest: SearchRequest): void {
    const expr = this.buildSearchExpression(selectQuery, searchRequest);
    if (expr) {
      selectQuery.predicate.expressions.push(expr);
    }
  }

  private buildSearchExpression(selectQuery: SelectQuery, searchRequest: SearchRequest): Expression | undefined {
    const expressions: Expression[] = [];
    if (searchRequest.filters) {
      for (const filter of searchRequest.filters) {
        const expr = this.buildSearchFilterExpression(selectQuery, searchRequest, filter);
        if (expr) {
          expressions.push(expr);
        }
      }
    }
    if (expressions.length === 0) {
      return undefined;
    }
    if (expressions.length === 1) {
      return expressions[0];
    }
    return new Conjunction(expressions);
  }

  /**
   * Builds a single search filter as "WHERE" clause to the query builder.
   * @param selectQuery The select query builder.
   * @param searchRequest The search request.
   * @param filter The search filter.
   */
  private buildSearchFilterExpression(
    selectQuery: SelectQuery,
    searchRequest: SearchRequest,
    filter: Filter
  ): Expression | undefined {
    if (typeof filter.value !== 'string') {
      throw new OperationOutcomeError(badRequest('Search filter value must be a string'));
    }

    const specialParamExpression = this.trySpecialSearchParameter(selectQuery, searchRequest, filter);
    if (specialParamExpression) {
      return specialParamExpression;
    }

    const resourceType = searchRequest.resourceType;
    let param = getSearchParameter(resourceType, filter.code);
    if (!param || !param.code) {
      throw new OperationOutcomeError(badRequest(`Unknown search parameter: ${filter.code}`));
    }

    if (filter.operator === FhirOperator.IDENTIFIER) {
      param = deriveIdentifierSearchParameter(param);
      filter = {
        ...filter,
        code: param.code as string,
        operator: FhirOperator.EQUALS,
      };
    }

    const lookupTable = this.getLookupTable(resourceType, param);
    if (lookupTable) {
      return lookupTable.buildWhere(selectQuery, resourceType, filter);
    }

    // Not any special cases, just a normal search parameter.
    return this.buildNormalSearchFilterExpression(resourceType, param, filter);
  }

  /**
   * Builds a search filter expression for a normal search parameter.
   *
   * Not any special cases, just a normal search parameter.
   *
   * @param resourceType The FHIR resource type.
   * @param param The FHIR search parameter.
   * @param filter The search filter.
   * @returns A SQL "WHERE" clause expression.
   */
  private buildNormalSearchFilterExpression(resourceType: string, param: SearchParameter, filter: Filter): Expression {
    const details = getSearchParameterDetails(resourceType, param);
    if (filter.operator === FhirOperator.MISSING) {
      return new Condition(details.columnName, filter.value === 'true' ? Operator.EQUALS : Operator.NOT_EQUALS, null);
    } else if (param.type === 'string') {
      return this.buildStringSearchFilter(details, filter);
    } else if (param.type === 'token' || param.type === 'uri') {
      return this.buildTokenSearchFilter(resourceType, details, filter);
    } else if (param.type === 'reference') {
      return this.buildReferenceSearchFilter(details, filter);
    } else if (param.type === 'date') {
      return this.buildDateSearchFilter(details, filter);
    } else if (param.type === 'quantity') {
      return new Condition(details.columnName, fhirOperatorToSqlOperator(filter.operator), parseFloat(filter.value));
    } else {
      return new Condition(details.columnName, fhirOperatorToSqlOperator(filter.operator), filter.value);
    }
  }

  /**
   * Returns true if the search parameter code is a special search parameter.
   *
   * See: https://www.hl7.org/fhir/search.html#all
   *
   * @param resourceType The resource type.
   * @param filter The search filter.
   * @returns True if the search parameter is a special code.
   */
  private trySpecialSearchParameter(
    selectQuery: SelectQuery,
    searchRequest: SearchRequest,
    filter: Filter
  ): Expression | undefined {
    const resourceType = searchRequest.resourceType;
    const code = filter.code;

    if (code === '_id') {
      return this.buildTokenSearchFilter(resourceType, { columnName: 'id', type: SearchParameterType.UUID }, filter);
    }

    if (code === '_lastUpdated') {
      return this.buildDateSearchFilter({ type: SearchParameterType.DATETIME, columnName: 'lastUpdated' }, filter);
    }

    if (code === '_compartment' || code === '_project') {
      return this.buildTokenSearchFilter(
        resourceType,
        { columnName: 'compartments', type: SearchParameterType.UUID, array: true },
        filter
      );
    }

    if (code === '_filter') {
      return this.buildFilterParameterExpression(selectQuery, searchRequest, parseFilterParameter(filter.value));
    }

    return undefined;
  }

  private buildFilterParameterExpression(
    selectQuery: SelectQuery,
    searchRequest: SearchRequest,
    filterExpression: FhirFilterExpression
  ): Expression {
    if (filterExpression instanceof FhirFilterNegation) {
      return this.buildFilterParameterNegation(selectQuery, searchRequest, filterExpression);
    } else if (filterExpression instanceof FhirFilterConnective) {
      return this.buildFilterParameterConnective(selectQuery, searchRequest, filterExpression);
    } else if (filterExpression instanceof FhirFilterComparison) {
      return this.buildFilterParameterComparison(selectQuery, searchRequest, filterExpression);
    } else {
      throw new OperationOutcomeError(badRequest('Unknown filter expression type'));
    }
  }

  private buildFilterParameterNegation(
    selectQuery: SelectQuery,
    searchRequest: SearchRequest,
    filterNegation: FhirFilterNegation
  ): Expression {
    return new Negation(this.buildFilterParameterExpression(selectQuery, searchRequest, filterNegation.child));
  }

  private buildFilterParameterConnective(
    selectQuery: SelectQuery,
    searchRequest: SearchRequest,
    filterConnective: FhirFilterConnective
  ): Expression {
    const expressions = [
      this.buildFilterParameterExpression(selectQuery, searchRequest, filterConnective.left),
      this.buildFilterParameterExpression(selectQuery, searchRequest, filterConnective.right),
    ];
    return filterConnective.keyword === 'and' ? new Conjunction(expressions) : new Disjunction(expressions);
  }

  private buildFilterParameterComparison(
    selectQuery: SelectQuery,
    searchRequest: SearchRequest,
    filterComparison: FhirFilterComparison
  ): Expression {
    return this.buildSearchFilterExpression(selectQuery, searchRequest, {
      code: filterComparison.path,
      operator: filterComparison.operator as FhirOperator,
      value: filterComparison.value,
    }) as Expression;
  }

  /**
   * Adds a string search filter as "WHERE" clause to the query builder.
   * @param details The search parameter details.
   * @param filter The search filter.
   */
  private buildStringSearchFilter(details: SearchParameterDetails, filter: Filter): Expression {
    if (filter.operator === FhirOperator.EXACT) {
      return new Condition(details.columnName, Operator.EQUALS, filter.value);
    }
    return new Condition(details.columnName, Operator.LIKE, '%' + filter.value + '%');
  }

  /**
   * Adds a token search filter as "WHERE" clause to the query builder.
   * @param resourceType The resource type.
   * @param details The search parameter details.
   * @param filter The search filter.
   */
  private buildTokenSearchFilter(resourceType: string, details: SearchParameterDetails, filter: Filter): Expression {
    const column = new Column(resourceType, details.columnName);
    const expressions = [];
    for (const valueStr of filter.value.split(',')) {
      let value: string | boolean = valueStr;
      if (details.type === SearchParameterType.BOOLEAN) {
        value = valueStr === 'true';
      } else if (details.type === SearchParameterType.UUID) {
        if (!validator.isUUID(valueStr)) {
          value = '00000000-0000-0000-0000-000000000000';
        }
      } else if (valueStr.includes('|')) {
        value = valueStr.split('|').pop() as string;
      }
      if (details.array) {
        expressions.push(new Condition(column, Operator.ARRAY_CONTAINS, value, details.type + '[]'));
      } else if (filter.operator === FhirOperator.CONTAINS) {
        expressions.push(new Condition(column, Operator.LIKE, '%' + value + '%'));
      } else {
        expressions.push(new Condition(column, Operator.EQUALS, value));
      }
    }
    const disjunction = new Disjunction(expressions);
    if (filter.operator === FhirOperator.NOT_EQUALS || filter.operator === FhirOperator.NOT) {
      return new Negation(disjunction);
    }
    return disjunction;
  }

  /**
   * Adds a reference search filter as "WHERE" clause to the query builder.
   * @param predicate The select query predicate conjunction.
   * @param details The search parameter details.
   * @param filter The search filter.
   */
  private buildReferenceSearchFilter(details: SearchParameterDetails, filter: Filter): Expression {
    const values = [];
    for (const value of filter.value.split(',')) {
      if (!value.includes('/') && (details.columnName === 'subject' || details.columnName === 'patient')) {
        values.push('Patient/' + value);
      } else {
        values.push(value);
      }
    }
    if (details.array) {
      return new Condition(details.columnName, Operator.ARRAY_CONTAINS, values);
    }
    if (values.length === 1) {
      return new Condition(details.columnName, Operator.EQUALS, values[0]);
    }
    return new Condition(details.columnName, Operator.IN, values);
  }

  /**
   * Adds a date or date/time search filter.
   * @param predicate The select query predicate conjunction.
   * @param details The search parameter details.
   * @param filter The search filter.
   */
  private buildDateSearchFilter(details: SearchParameterDetails, filter: Filter): Expression {
    const dateValue = new Date(filter.value);
    if (isNaN(dateValue.getTime())) {
      throw new OperationOutcomeError(badRequest(`Invalid date value: ${filter.value}`));
    }
    return new Condition(details.columnName, fhirOperatorToSqlOperator(filter.operator), filter.value);
  }

  /**
   * Adds all "order by" clauses to the query builder.
   * @param builder The client query builder.
   * @param searchRequest The search request.
   */
  private addSortRules(builder: SelectQuery, searchRequest: SearchRequest): void {
    searchRequest.sortRules?.forEach((sortRule) => this.addOrderByClause(builder, searchRequest, sortRule));
  }

  /**
   * Adds a single "order by" clause to the query builder.
   * @param builder The client query builder.
   * @param searchRequest The search request.
   * @param sortRule The sort rule.
   */
  private addOrderByClause(builder: SelectQuery, searchRequest: SearchRequest, sortRule: SortRule): void {
    if (sortRule.code === '_lastUpdated') {
      builder.orderBy('lastUpdated', !!sortRule.descending);
      return;
    }

    const resourceType = searchRequest.resourceType;
    const param = getSearchParameter(resourceType, sortRule.code);
    if (!param || !param.code) {
      return;
    }

    const lookupTable = this.getLookupTable(resourceType, param);
    if (lookupTable) {
      lookupTable.addOrderBy(builder, resourceType, sortRule);
      return;
    }

    const details = getSearchParameterDetails(resourceType, param);
    builder.orderBy(details.columnName, !!sortRule.descending);
  }

  /**
   * Writes the resource to the resource table.
   * This builds all search parameter columns.
   * This does *not* write the version to the history table.
   * @param client The database client inside the transaction.
   * @param resource The resource.
   */
  private async writeResource(client: PoolClient, resource: Resource): Promise<void> {
    const resourceType = resource.resourceType;
    const meta = resource.meta as Meta;
    const compartments = meta.compartment?.map((ref) => resolveId(ref));
    const content = stringify(resource);

    const columns: Record<string, any> = {
      id: resource.id,
      lastUpdated: meta.lastUpdated,
      deleted: false,
      compartments,
      content,
    };

    const searchParams = getSearchParameters(resourceType);
    if (searchParams) {
      for (const searchParam of Object.values(searchParams)) {
        this.buildColumn(resource, columns, searchParam);
      }
    }

    await new InsertQuery(resourceType, [columns]).mergeOnConflict(true).execute(client);
  }

  /**
   * Writes a version of the resource to the resource history table.
   * @param client The database client inside the transaction.
   * @param resource The resource.
   */
  private async writeResourceVersion(client: PoolClient, resource: Resource): Promise<void> {
    const resourceType = resource.resourceType;
    const meta = resource.meta as Meta;
    const content = stringify(resource);

    await new InsertQuery(resourceType + '_History', [
      {
        id: resource.id,
        versionId: meta.versionId,
        lastUpdated: meta.lastUpdated,
        content,
      },
    ]).execute(client);
  }

  /**
   * Builds a list of compartments for the resource for writing.
   * FHIR compartments are used for two purposes.
   * 1) Search narrowing (i.e., /Patient/123/Observation searches within the patient compartment).
   * 2) Access controls.
   * @param resource The resource.
   * @returns The list of compartments for the resource.
   */
  private getCompartments(resource: Resource): Reference[] {
    const result: Reference[] = [];

    if (resource.meta?.project) {
      result.push({ reference: 'Project/' + resource.meta.project });
    }

    if (resource.meta?.account) {
      result.push(resource.meta.account);
    }

    const patient = getPatient(resource);
    if (patient) {
      const patientId = resolveId(patient);
      if (patientId && validator.isUUID(patientId)) {
        result.push(patient);
      }
    }

    return result;
  }

  /**
   * Builds the columns to write for a given resource and search parameter.
   * If nothing to write, then no columns will be added.
   * Some search parameters can result in multiple columns (for example, Reference objects).
   * @param resource The resource to write.
   * @param columns The output columns to write.
   * @param searchParam The search parameter definition.
   */
  private buildColumn(resource: Resource, columns: Record<string, any>, searchParam: SearchParameter): void {
    if (
      searchParam.code === '_id' ||
      searchParam.code === '_lastUpdated' ||
      searchParam.code === '_compartment' ||
      searchParam.type === 'composite' ||
      this.isIndexTable(resource.resourceType, searchParam)
    ) {
      return;
    }

    const details = getSearchParameterDetails(resource.resourceType, searchParam);
    const values = evalFhirPath(searchParam.expression as string, resource);

    if (values.length > 0) {
      if (details.array) {
        columns[details.columnName] = values.map((v) => this.buildColumnValue(searchParam, details, v));
      } else {
        columns[details.columnName] = this.buildColumnValue(searchParam, details, values[0]);
      }
    } else {
      columns[details.columnName] = null;
    }
  }

  /**
   * Builds a single value for a given search parameter.
   * If the search parameter is an array, then this method will be called for each element.
   * If the search parameter is not an array, then this method will be called for the value.
   * @param searchParam The search parameter definition.
   * @param details The extra search parameter details.
   * @param value The FHIR resource value.
   * @returns The column value.
   */
  private buildColumnValue(searchParam: SearchParameter, details: SearchParameterDetails, value: any): any {
    if (details.type === SearchParameterType.BOOLEAN) {
      return value === true || value === 'true';
    }

    if (details.type === SearchParameterType.DATE) {
      return this.buildDateColumn(value);
    }

    if (details.type === SearchParameterType.DATETIME) {
      return this.buildDateTimeColumn(value);
    }

    if (searchParam.type === 'reference') {
      return this.buildReferenceColumns(value);
    }

    if (searchParam.type === 'token') {
      return this.buildTokenColumn(value);
    }

    if (searchParam.type === 'quantity') {
      return this.buildQuantityColumn(value);
    }

    return typeof value === 'string' ? value : stringify(value);
  }

  /**
   * Builds the column value for a date parameter.
   * Tries to parse the date string.
   * Silently ignores failure.
   * @param value The FHIRPath result.
   * @returns The date string if parsed; undefined otherwise.
   */
  private buildDateColumn(value: any): string | undefined {
    if (typeof value === 'string') {
      try {
        const date = new Date(value);
        return date.toISOString().substring(0, 10);
      } catch (ex) {
        // Silent ignore
      }
    } else if (typeof value === 'object') {
      if ('start' in value) {
        // Can be a Period
        return this.buildDateColumn(value.start);
      }
    }
    return undefined;
  }

  /**
   * Builds the column value for a date/time parameter.
   * Tries to parse the date string.
   * Silently ignores failure.
   * @param value The FHIRPath result.
   * @returns The date/time string if parsed; undefined otherwise.
   */
  private buildDateTimeColumn(value: any): string | undefined {
    if (typeof value === 'string') {
      try {
        const date = new Date(value);
        return date.toISOString();
      } catch (ex) {
        // Silent ignore
      }
    }
    return undefined;
  }

  /**
   * Builds the columns to write for a Reference value.
   * @param value The property value of the reference.
   */
  private buildReferenceColumns(value: any): string | undefined {
    if (value) {
      if (typeof value === 'string') {
        // Handle "canonical" properties such as QuestionnaireResponse.questionnaire
        // This is a reference string that is not a FHIR reference
        return value;
      }
      if (typeof value === 'object') {
        // Handle normal "reference" properties
        return (value as Reference).reference;
      }
    }
    return undefined;
  }

  /**
   * Builds the column value to write a "code" search parameter.
   * The common cases are:
   *  1) The property value is a string, so return directly.
   *  2) The property value is a CodeableConcept.
   *  3) Otherwise fallback to stringify.
   * @param value The property value of the code.
   * @returns The value to write to the database column.
   */
  private buildTokenColumn(value: any): string | undefined {
    if (!value) {
      return undefined;
    }

    if (typeof value === 'string') {
      // If the value is a string, return the value directly
      return value;
    }

    if (typeof value === 'object') {
      const codeableConceptValue = this.buildCodeableConceptColumn(value);
      if (codeableConceptValue) {
        return codeableConceptValue;
      }
    }

    // Otherwise, return a stringified version of the value
    return stringify(value);
  }

  /**
   * Builds a CodeableConcept column value.
   * @param value The property value of the code.
   * @returns The value to write to the database column.
   */
  private buildCodeableConceptColumn(value: any): string | undefined {
    // If the value is a CodeableConcept,
    // then use the following logic to determine the code:
    // 1) value.coding[0].code
    // 2) value.coding[0].display
    // 3) value.text
    if ('coding' in value) {
      const coding = value.coding;
      if (Array.isArray(coding) && coding.length > 0) {
        if (coding[0].code) {
          return coding[0].code;
        }

        if (coding[0].display) {
          return coding[0].display;
        }
      }
    }

    if ('text' in value) {
      return value.text as string;
    }

    return undefined;
  }

  /**
   * Builds a Quantity column value.
   * @param value The property value of the quantity.
   * @returns The numeric value if available; undefined otherwise.
   */
  private buildQuantityColumn(value: any): number | undefined {
    if (typeof value === 'object') {
      if ('value' in value) {
        const num = value.value;
        if (typeof num === 'number') {
          return num;
        }
      }
    }
    return undefined;
  }

  /**
   * Writes resources values to the lookup tables.
   * @param client The database client inside the transaction.
   * @param resource The resource to index.
   */
  private async writeLookupTables(client: PoolClient, resource: Resource): Promise<void> {
    for (const lookupTable of lookupTables) {
      await lookupTable.indexResource(client, resource);
    }
  }

  /**
   * Deletes values from lookup tables.
   * @param client The database client inside the transaction.
   * @param resource The resource to delete.
   */
  private async deleteFromLookupTables(client: Pool | PoolClient, resource: Resource): Promise<void> {
    for (const lookupTable of lookupTables) {
      await lookupTable.deleteValuesForResource(client, resource);
    }
  }

  private isIndexTable(resourceType: string, searchParam: SearchParameter): boolean {
    return !!this.getLookupTable(resourceType, searchParam);
  }

  private getLookupTable(resourceType: string, searchParam: SearchParameter): LookupTable<unknown> | undefined {
    for (const lookupTable of lookupTables) {
      if (lookupTable.isIndexed(searchParam, resourceType)) {
        return lookupTable;
      }
    }
    return undefined;
  }

  /**
   * Returns the last updated timestamp for the resource.
   * During historical data migration, some client applications are allowed
   * to override the timestamp.
   * @param resource The FHIR resource.
   * @returns The last updated date.
   */
  private getLastUpdated(existing: Resource | undefined, resource: Resource): string {
    if (!existing) {
      // If the resource has a specified "lastUpdated",
      // and there is no existing version,
      // and the current context is a ClientApplication (i.e., OAuth client credentials),
      // then allow the ClientApplication to set the date.
      const lastUpdated = resource.meta?.lastUpdated;
      if (lastUpdated && this.canWriteMeta()) {
        return lastUpdated;
      }
    }

    // Otherwise, use "now"
    return new Date().toISOString();
  }

  /**
   * Returns the project ID for the resource.
   * If it is a public resource type, then returns the public project ID.
   * If it is a protected resource type, then returns the Medplum project ID.
   * Otherwise, by default, return the current context project ID.
   * @param resource The FHIR resource.
   * @returns The project ID.
   */
  private getProjectId(resource: Resource): string | undefined {
    if (resource.resourceType === 'Project') {
      return resource.id;
    }

    if (resource.resourceType === 'ProjectMembership') {
      return resolveId(resource.project);
    }

    if (publicResourceTypes.includes(resource.resourceType)) {
      return undefined;
    }

    if (protectedResourceTypes.includes(resource.resourceType)) {
      return undefined;
    }

    const submittedProjectId = resource.meta?.project;
    if (submittedProjectId && this.canWriteMeta()) {
      // If the resource has an project (whether provided or from existing),
      // and the current context is allowed to write meta,
      // then use the provided value.
      return submittedProjectId;
    }

    return this.context.project;
  }

  /**
   * Returns the author reference.
   * If the current context is allowed to write meta,
   * and the provided resource includes an author reference,
   * then use the provided value.
   * Otherwise uses the current context profile.
   * @param resource The FHIR resource.
   * @returns
   */
  private getAuthor(resource: Resource): Reference {
    // If the resource has an author (whether provided or from existing),
    // and the current context is allowed to write meta,
    // then use the provided value.
    const author = resource.meta?.author;
    if (author && this.canWriteMeta()) {
      return author;
    }

    return this.context.author;
  }

  /**
   * Returns the author reference string (resourceType/id).
   * If the current context is a ClientApplication, handles "on behalf of".
   * Otherwise uses the current context profile.
   * @param resource The FHIR resource.
   * @returns
   */
  private async getAccount(
    existing: Resource | undefined,
    updated: Resource,
    create: boolean
  ): Promise<Reference | undefined> {
    const account = updated.meta?.account;
    if (account && this.canWriteAccount()) {
      // If the user specifies an account, allow it if they have permission.
      return account;
    }

    if (create && this.context.accessPolicy?.compartment) {
      // If the user access policy specifies a compartment, then use it as the account.
      return this.context.accessPolicy?.compartment;
    }

    if (updated.resourceType !== 'Patient') {
      const patientRef = getPatient(updated);
      if (patientRef) {
        // If the resource is in a patient compartment, then lookup the patient.
        try {
          const patient = await systemRepo.readReference(patientRef);
          if (patient?.meta?.account) {
            // If the patient has an account, then use it as the resource account.
            return patient.meta.account;
          }
        } catch (err) {
          logger.debug('Error setting patient compartment', err);
        }
      }
    }

    // Otherwise, default to the existing value.
    return existing?.meta?.account ?? updated.meta?.account;
  }

  /**
   * Determines if the current user can manually set the ID field.
   * This is very powerful, and reserved for the system account.
   * @returns True if the current user can manually set the ID field.
   */
  private canSetId(): boolean {
    return this.isSuperAdmin();
  }

  /**
   * Determines if the current user can manually set meta fields.
   * @returns True if the current user can manually set meta fields.
   */
  private canWriteMeta(): boolean {
    return this.isSuperAdmin();
  }

  private canWriteAccount(): boolean {
    return this.isSuperAdmin() || this.isProjectAdmin();
  }

  /**
   * Determines if the current user can read the specified resource type.
   * @param resourceType The resource type.
   * @returns True if the current user can read the specified resource type.
   */
  private canReadResourceType(resourceType: string): boolean {
    if (this.isSuperAdmin()) {
      return true;
    }
    if (protectedResourceTypes.includes(resourceType)) {
      return false;
    }
    if (publicResourceTypes.includes(resourceType)) {
      return true;
    }
    if (!this.context.accessPolicy) {
      return true;
    }
    if (this.context.accessPolicy.resource) {
      for (const resourcePolicy of this.context.accessPolicy.resource) {
        if (this.matchesAccessPolicyResourceType(resourcePolicy.resourceType, resourceType)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Determines if the current user can write the specified resource type.
   * This is a preliminary check before evaluating a write operation in depth.
   * If a user cannot write a resource type at all, then don't bother looking up previous versions.
   * @param resourceType The resource type.
   * @returns True if the current user can write the specified resource type.
   */
  private canWriteResourceType(resourceType: string): boolean {
    if (this.isSuperAdmin()) {
      return true;
    }
    if (protectedResourceTypes.includes(resourceType)) {
      return false;
    }
    if (publicResourceTypes.includes(resourceType)) {
      return false;
    }
    if (!this.context.accessPolicy) {
      return true;
    }
    if (this.context.accessPolicy.resource) {
      for (const resourcePolicy of this.context.accessPolicy.resource) {
        if (
          this.matchesAccessPolicyResourceType(resourcePolicy.resourceType, resourceType) &&
          !resourcePolicy.readonly
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Determines if the current user can write the specified resource.
   * This is a more in-depth check after building the candidate result of a write operation.
   * @param resource The resource.
   * @returns True if the current user can write the specified resource type.
   */
  private canWriteResource(resource: Resource): boolean {
    if (this.isSuperAdmin()) {
      return true;
    }
    const resourceType = resource.resourceType;
    if (protectedResourceTypes.includes(resourceType)) {
      return false;
    }
    if (publicResourceTypes.includes(resourceType)) {
      return false;
    }
    return this.matchesAccessPolicy(resource, false);
  }

  /**
   * Returns true if the resource satisfies the current access policy.
   * @param resource The resource.
   * @param readonly True if the resource is being read.
   * @returns True if the resource matches the access policy.
   */
  private matchesAccessPolicy(resource: Resource, readonly: boolean): boolean {
    if (!this.context.accessPolicy) {
      return true;
    }
    if (this.context.accessPolicy.resource) {
      for (const resourcePolicy of this.context.accessPolicy.resource) {
        if (this.matchesAccessPolicyResourcePolicy(resource, resourcePolicy, readonly)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns true if the resource satisfies the specified access policy resource policy.
   * @param resource The resource.
   * @param resourcePolicy One per-resource policy section from the access policy.
   * @param readonly True if the resource is being read.
   * @returns True if the resource matches the access policy.
   */
  private matchesAccessPolicyResourcePolicy(
    resource: Resource,
    resourcePolicy: AccessPolicyResource,
    readonly: boolean
  ): boolean {
    const resourceType = resource.resourceType;
    if (!this.matchesAccessPolicyResourceType(resourcePolicy.resourceType, resourceType)) {
      return false;
    }
    if (!readonly && resourcePolicy.readonly) {
      return false;
    }
    if (
      resourcePolicy.compartment &&
      !resource.meta?.compartment?.find((c) => c.reference === resourcePolicy.compartment?.reference)
    ) {
      // Deprecated - to be removed
      return false;
    }
    if (
      resourcePolicy.criteria &&
      !matchesSearchRequest(resource, this.parseCriteriaAsSearchRequest(resourcePolicy.criteria))
    ) {
      return false;
    }
    return true;
  }

  /**
   * Returns true if the resource type matches the access policy resource type.
   * @param accessPolicyResourceType The resource type from the access policy.
   * @param resourceType The candidate resource resource type.
   * @returns True if the resource type matches the access policy resource type.
   */
  private matchesAccessPolicyResourceType(accessPolicyResourceType: string | undefined, resourceType: string): boolean {
    if (accessPolicyResourceType === resourceType) {
      return true;
    }
    if (accessPolicyResourceType === '*' && !projectAdminResourceTypes.includes(resourceType)) {
      // Project admin resource types are not allowed to be wildcarded
      // Project admin resource types must be explicitly included
      return true;
    }
    return false;
  }

  /**
   * Returns true if the resource is "cache only" and not written to the database.
   * This is a highly specialized use case for internal system resources.
   * @param resource The candidate resource.
   * @returns True if the resource should be cached only and not written to the database.
   */
  private isCacheOnly(resource: Resource): boolean {
    return resource.resourceType === 'Login' && (resource.authMethod === 'client' || resource.authMethod === 'execute');
  }

  private parseCriteriaAsSearchRequest(criteria: string): SearchRequest {
    return parseSearchUrl(new URL(criteria, 'https://api.medplum.com/'));
  }

  /**
   * Removes hidden fields from a resource as defined by the access policy.
   * This should be called for any "read" operation.
   * @param input The input resource.
   */
  private removeHiddenFields<T extends Resource>(input: T): T {
    const policy = this.getResourceAccessPolicy(input.resourceType);
    if (policy?.hiddenFields) {
      for (const field of policy.hiddenFields) {
        this.removeField(input, field);
      }
    }
    if (!this.context.extendedMode) {
      const meta = input.meta as Meta;
      meta.author = undefined;
      meta.project = undefined;
      meta.account = undefined;
      meta.compartment = undefined;
    }
    return input;
  }

  /**
   * Overwrites readonly fields from a resource as defined by the access policy.
   * If no original (i.e., this is the first version), then blank them out.
   * This should be called for any "write" operation.
   * @param input The input resource.
   * @param original The previous version, if it exists.
   */
  private restoreReadonlyFields<T extends Resource>(input: T, original: T | undefined): T {
    const policy = this.getResourceAccessPolicy(input.resourceType);
    if (policy?.readonlyFields) {
      for (const field of policy.readonlyFields) {
        this.removeField(input, field);
        if (original) {
          const value = original[field as keyof T];
          if (value) {
            input[field as keyof T] = value;
          }
        }
      }
    }
    return input;
  }

  /**
   * Removes a field from the input resource.
   * Uses JSONPatch to process the remove operation, which supports nested fields.
   * @param input The input resource.
   * @param path The path to the field to remove.
   * @returns The new document with the field removed.
   */
  private removeField<T extends Resource>(input: T, path: string): T {
    const patch: Operation[] = [{ op: 'remove', path: `/${path.replaceAll('.', '/')}` }];
    applyPatch(input, patch);
    return input;
  }

  private getResourceAccessPolicy(resourceType: string): AccessPolicyResource | undefined {
    if (this.context.accessPolicy?.resource) {
      for (const resourcePolicy of this.context.accessPolicy.resource) {
        if (resourcePolicy.resourceType === resourceType) {
          return resourcePolicy;
        }
      }
    }
    return undefined;
  }

  private isSuperAdmin(): boolean {
    return !!this.context.superAdmin;
  }

  private isProjectAdmin(): boolean {
    return !!this.context.projectAdmin;
  }

  /**
   * Logs an AuditEvent for a restful operation.
   * @param subtype The AuditEvent subtype.
   * @param outcome The AuditEvent outcome.
   * @param description The description.  Can be a string, object, or Error.  Will be normalized to a string.
   * @param resource Optional resource to associate with the AuditEvent.
   * @param search Optional search parameters to associate with the AuditEvent.
   */
  private logEvent(
    subtype: AuditEventSubtype,
    outcome: AuditEventOutcome,
    description?: unknown,
    resource?: Resource,
    search?: SearchRequest
  ): void {
    if (this.context.author.reference === 'system') {
      // Don't log system events.
      return;
    }
    if (resource && publicResourceTypes.includes(resource.resourceType)) {
      // Don't log public events.
      return;
    }
    if (search && publicResourceTypes.includes(search.resourceType)) {
      // Don't log public events.
      return;
    }
    let outcomeDesc: string | undefined = undefined;
    if (description) {
      outcomeDesc = normalizeErrorString(description);
    }
    let query: string | undefined = undefined;
    if (search) {
      query = search.resourceType + formatSearchQuery(search);
    }
    logRestfulEvent(
      subtype,
      this.context.project as string,
      this.context.author,
      this.context.remoteAddress,
      outcome,
      outcomeDesc,
      resource,
      query
    );
  }
}

/**
 * Tries to read a cache entry from Redis by resource type and ID.
 * @param resourceType The resource type.
 * @param id The resource ID.
 * @returns The cache entry if found; otherwise, undefined.
 */
async function getCacheEntry<T extends Resource>(resourceType: string, id: string): Promise<CacheEntry<T> | undefined> {
  const cachedValue = await getRedis().get(getCacheKey(resourceType, id));
  return cachedValue ? (JSON.parse(cachedValue) as CacheEntry<T>) : undefined;
}

/**
 * Performs a bulk read of cache entries from Redis.
 * @param references Array of FHIR references.
 * @returns Array of cache entries or undefined.
 */
async function getCacheEntries(references: Reference[]): Promise<(CacheEntry<Resource> | undefined)[]> {
  return (await getRedis().mget(...references.map((r) => r.reference as string))).map((cachedValue) =>
    cachedValue ? (JSON.parse(cachedValue) as CacheEntry<Resource>) : undefined
  );
}

/**
 * Writes a cache entry to Redis.
 * @param resource The resource to cache.
 */
async function setCacheEntry(resource: Resource): Promise<void> {
  await getRedis().set(
    getCacheKey(resource.resourceType, resource.id as string),
    JSON.stringify({ resource, projectId: resource.meta?.project }),
    'EX',
    24 * 60 * 60 // 24 hours in seconds
  );
}

/**
 * Deletes a cache entry from Redis.
 * @param resourceType The resource type.
 * @param id The resource ID.
 */
async function deleteCacheEntry(resourceType: string, id: string): Promise<void> {
  await getRedis().del(getCacheKey(resourceType, id));
}

/**
 * Deletes cache entries from Redis.
 * @param resourceType The resource type.
 * @param ids The resource IDs.
 */
async function deleteCacheEntries(resourceType: string, ids: string[]): Promise<void> {
  const cacheKeys = ids.map((id) => {
    return getCacheKey(resourceType, id);
  });

  await getRedis().del(cacheKeys);
}

/**
 * Returns the redis cache key for the given resource type and resource ID.
 * @param resourceType The resource type.
 * @param id The resource ID.
 * @returns The Redis cache key.
 */
function getCacheKey(resourceType: string, id: string): string {
  return `${resourceType}/${id}`;
}

/**
 * Converts a FHIR search operator into a SQL operator.
 * Only works for simple conversions.
 * For complex conversions, need to build custom SQL.
 * @param fhirOperator The FHIR operator.
 * @returns The equivalent SQL operator.
 */
function fhirOperatorToSqlOperator(fhirOperator: FhirOperator): Operator {
  switch (fhirOperator) {
    case FhirOperator.EQUALS:
      return Operator.EQUALS;
    case FhirOperator.NOT:
    case FhirOperator.NOT_EQUALS:
      return Operator.NOT_EQUALS;
    case FhirOperator.GREATER_THAN:
    case FhirOperator.STARTS_AFTER:
      return Operator.GREATER_THAN;
    case FhirOperator.GREATER_THAN_OR_EQUALS:
      return Operator.GREATER_THAN_OR_EQUALS;
    case FhirOperator.LESS_THAN:
    case FhirOperator.ENDS_BEFORE:
      return Operator.LESS_THAN;
    case FhirOperator.LESS_THAN_OR_EQUALS:
      return Operator.LESS_THAN_OR_EQUALS;
    default:
      throw new Error(`Unknown FHIR operator: ${fhirOperator}`);
  }
}

export const systemRepo = new Repository({
  superAdmin: true,
  strictMode: true,
  extendedMode: true,
  author: {
    reference: 'system',
  },
});
