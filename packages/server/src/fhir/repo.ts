import {
  allOk,
  badRequest,
  canReadResourceType,
  canWriteResourceType,
  deepEquals,
  evalFhirPath,
  forbidden,
  formatSearchQuery,
  getSearchParameterDetails,
  getStatus,
  gone,
  isGone,
  isNotFound,
  isOk,
  normalizeErrorString,
  normalizeOperationOutcome,
  notFound,
  OperationOutcomeError,
  parseCriteriaAsSearchRequest,
  protectedResourceTypes,
  publicResourceTypes,
  resolveId,
  SearchParameterDetails,
  SearchParameterType,
  SearchRequest,
  stringify,
  tooManyRequests,
  validate,
  validateResourceType,
  Operator as FhirOperator,
  satisfiedAccessPolicy,
  AccessPolicyInteraction,
  evalFhirPathTyped,
} from '@medplum/core';
import { BaseRepository, FhirRepository } from '@medplum/fhir-router';
import {
  AccessPolicy,
  AccessPolicyResource,
  Bundle,
  BundleEntry,
  Meta,
  OperationOutcome,
  Reference,
  Resource,
  ResourceType,
  SearchParameter,
  StructureDefinition,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { applyPatch, Operation } from 'rfc6902';
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
import { ValueSetElementTable } from './lookups/valuesetelement';
import { getPatient } from './patient';
import { validateReferences } from './references';
import { rewriteAttachments, RewriteMode } from './rewrite';
import { buildSearchExpression, getFullUrl, searchImpl } from './search';
import { Condition, DeleteQuery, Disjunction, Expression, InsertQuery, Operator, SelectQuery } from './sql';
import { getSearchParameters } from './structure';

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
 * The lookup tables array includes a list of special tables for search indexing.
 */
const lookupTables: LookupTable<unknown>[] = [
  new AddressTable(),
  new HumanNameTable(),
  new TokenTable(),
  new ValueSetElementTable(),
];

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
    if (!satisfiedAccessPolicy(cacheEntry.resource, AccessPolicyInteraction.READ, this.context.accessPolicy)) {
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
          fullUrl: getFullUrl(resourceType, row.id),
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
    const { resourceType, id } = resource;
    if (!id) {
      throw new OperationOutcomeError(badRequest('Missing id'));
    } else if (!validator.isUUID(id)) {
      throw new OperationOutcomeError(badRequest('Invalid id'));
    }
    await this.validate(resource);

    if (this.context.checkReferencesOnWrite) {
      await validateReferences(this, resource);
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
      if (!this.canWriteToResource(existing)) {
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
      ...updated.meta,
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
    } else if (!this.isResourceWriteable(existing, result)) {
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

  private async validate(resource: Resource): Promise<void> {
    if (this.context.strictMode) {
      const start = process.hrtime.bigint();
      const profileUrls = resource.meta?.profile;
      validate(resource);
      if (profileUrls) {
        await this.validateProfiles(resource, profileUrls);
      }

      const elapsedTime = Number(process.hrtime.bigint() - start);
      const MILLISECONDS = 1e6; // Conversion factor from ns to ms
      if (elapsedTime > 10 * MILLISECONDS) {
        logger.debug('High validator latency', {
          resourceType: resource.resourceType,
          id: resource.id,
          time: elapsedTime / MILLISECONDS,
        });
      }
    } else {
      validateResourceWithJsonSchema(resource);
    }
  }

  private async validateProfiles(resource: Resource, profileUrls: string[]): Promise<void> {
    for (const url of profileUrls) {
      const loadStart = process.hrtime.bigint();
      const profile = await this.loadProfile(url);
      const loadTime = Number(process.hrtime.bigint() - loadStart);
      if (!profile) {
        logger.warn('Unknown profile referenced', {
          resource: `${resource.resourceType}/${resource.id}`,
          url,
        });
        continue;
      }
      const validateStart = process.hrtime.bigint();
      validate(resource, profile);
      const validateTime = Number(process.hrtime.bigint() - validateStart);
      logger.debug('Profile loaded', {
        url,
        loadTime,
        validateTime,
      });
    }
  }

  private async loadProfile(url: string): Promise<StructureDefinition | undefined> {
    const redis = getRedis();
    const cacheKey = `Project/${this.context.project}/StructureDefinition/${url}`;
    // Try retrieving from cache
    const cachedProfile = await redis.get(cacheKey);
    if (cachedProfile) {
      return (JSON.parse(cachedProfile) as CacheEntry<StructureDefinition>).resource;
    }

    // Fall back to loading from the DB; descending version sort approximates version resolution for some cases
    const profile = await this.searchOne<StructureDefinition>({
      resourceType: 'StructureDefinition',
      filters: [
        {
          code: 'url',
          operator: FhirOperator.EQUALS,
          value: url,
        },
      ],
      sortRules: [
        {
          code: 'version',
          descending: true,
        },
      ],
    });

    if (profile) {
      // Store loaded profile in cache
      await redis.set(
        cacheKey,
        JSON.stringify({ resource: profile, projectId: profile.meta?.project }),
        'EX',
        24 * 60 * 60 // 24 hours in seconds
      );
    }
    return profile;
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
   * @param create Flag for "creating" vs "updating".
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
        logger.error('Failed to rebuild compartments for resource', { error: normalizeErrorString(err) });
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
        logger.error('Failed to reindex resource', { error: normalizeErrorString(err) });
      }
    });
  }

  /**
   * Reindexes the resource.
   * This is only available to the system and super admin accounts.
   * This should not result in any change to the resource or its history.
   * @param resourceType The resource type.
   * @param id The resource ID.
   * @returns Promise to complete.
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
   * @returns Promise to complete.
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
        projectId: resource.meta?.project,
        compartments: this.getCompartments(resource).map((ref) => resolveId(ref)),
        content,
      };

      const searchParams = getSearchParameters(resourceType);
      if (searchParams) {
        for (const searchParam of Object.values(searchParams)) {
          this.buildColumn({ resourceType } as Resource, columns, searchParam);
        }
      }

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
      await addSubscriptionJobs(resource, { interaction: 'delete' });
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

  async search<T extends Resource>(searchRequest: SearchRequest<T>): Promise<Bundle<T>> {
    try {
      const resourceType = searchRequest.resourceType;
      validateResourceType(resourceType);

      if (!this.canReadResourceType(resourceType)) {
        throw new OperationOutcomeError(forbidden);
      }

      const result = await searchImpl(this, searchRequest);
      this.logEvent(SearchInteraction, AuditEventOutcome.Success, undefined, undefined, searchRequest);
      return result;
    } catch (err) {
      this.logEvent(SearchInteraction, AuditEventOutcome.MinorFailure, err, undefined, searchRequest);
      throw err;
    }
  }

  /**
   * Adds filters to ignore soft-deleted resources.
   * @param builder The select query builder.
   */
  addDeletedFilter(builder: SelectQuery): void {
    builder.where('deleted', Operator.EQUALS, false);
  }

  /**
   * Adds security filters to the select query.
   * @param builder The select query builder.
   * @param resourceType The resource type for compartments.
   */
  addSecurityFilters(builder: SelectQuery, resourceType: string): void {
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
      builder.where('compartments', Operator.ARRAY_CONTAINS, this.context.project, 'UUID[]');
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
          expressions.push(new Condition('compartments', Operator.ARRAY_CONTAINS, policyCompartmentId, 'UUID[]'));
        } else if (policy.criteria) {
          // Add subquery for access policy criteria.
          const searchRequest = parseCriteriaAsSearchRequest(policy.criteria);
          const accessPolicyExpression = buildSearchExpression(builder, searchRequest);
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
      projectId: meta.project,
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
      // Deprecated - to be removed
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
      isIndexTable(resource.resourceType, searchParam)
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
    // "Date" column is a special case that only applies when the following conditions are true:
    // 1. The search parameter is a date type.
    // 2. The underlying FHIR ElementDefinition referred to by the search parameter has a type of "date".
    if (typeof value === 'string') {
      try {
        const date = new Date(value);
        return date.toISOString().substring(0, 10);
      } catch (ex) {
        // Silent ignore
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
    } else if (typeof value === 'object') {
      // Can be a Period
      if ('start' in value) {
        return this.buildDateTimeColumn(value.start);
      } else if ('end' in value) {
        return this.buildDateTimeColumn(value.end);
      }
    }
    return undefined;
  }

  /**
   * Builds the columns to write for a Reference value.
   * @param value The property value of the reference.
   * @returns The reference column value.
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

  /**
   * Returns the last updated timestamp for the resource.
   * During historical data migration, some client applications are allowed
   * to override the timestamp.
   * @param existing Existing resource if one exists.
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
   * @returns The author value.
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
   * @param existing Existing resource if one exists.
   * @param updated The incoming updated resource.
   * @param create Flag for when "creating" vs "updating".
   * @returns The account value.
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
      return this.context.accessPolicy.compartment;
    }

    if (updated.resourceType !== 'Patient') {
      const patientRef = getPatient(updated);
      if (patientRef) {
        // If the resource is in a patient compartment, then lookup the patient.
        try {
          const patient = await systemRepo.readReference(patientRef);
          if (patient.meta?.account) {
            // If the patient has an account, then use it as the resource account.
            return patient.meta.account;
          }
        } catch (err: any) {
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
  canReadResourceType(resourceType: string): boolean {
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
    return canReadResourceType(this.context.accessPolicy, resourceType as ResourceType);
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
    return canWriteResourceType(this.context.accessPolicy, resourceType as ResourceType);
  }

  /**
   * Determines if the current user can write to the specified resource.
   * This is a more in-depth check after building the candidate result of a write operation.
   * @param resource The resource.
   * @returns True if the current user can write the specified resource type.
   */
  private canWriteToResource(resource: Resource): boolean {
    if (this.isSuperAdmin()) {
      return true;
    }
    const resourceType = resource.resourceType;
    if (protectedResourceTypes.includes(resourceType)) {
      return false;
    } else if (publicResourceTypes.includes(resourceType)) {
      return false;
    }
    return !!satisfiedAccessPolicy(resource, AccessPolicyInteraction.UPDATE, this.context.accessPolicy);
  }

  /**
   * Check that a resource can be written in its current form.
   * @param previous The resource before updates were applied.
   * @param current The resource as it will be written.
   * @returns True if the current user can write the specified resource type.
   */
  private isResourceWriteable(previous: Resource | undefined, current: Resource): boolean {
    const matchingPolicy = satisfiedAccessPolicy(current, AccessPolicyInteraction.UPDATE, this.context.accessPolicy);
    if (!matchingPolicy) {
      return false;
    } else if (matchingPolicy?.writeConstraint) {
      return matchingPolicy.writeConstraint.every((constraint) => {
        const invariant = evalFhirPathTyped(
          constraint.expression as string,
          [{ type: current.resourceType, value: current }],
          {
            before: { type: previous?.resourceType ?? 'undefined', value: previous },
            after: { type: current.resourceType, value: current },
          }
        );
        return invariant.length === 1 && invariant[0].value === true;
      });
    } else {
      return true;
    }
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

  /**
   * Removes hidden fields from a resource as defined by the access policy.
   * This should be called for any "read" operation.
   * @param input The input resource.
   * @returns The resource with hidden fields removed.
   */
  removeHiddenFields<T extends Resource>(input: T): T {
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
   * @returns The resource with restored hidden fields.
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
    // applyPatch returns errors if the value is missing
    // but we don't care if the value is missing in this case
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
    const auditEvent = logRestfulEvent(
      subtype,
      this.context.project as string,
      this.context.author,
      this.context.remoteAddress,
      outcome,
      outcomeDesc,
      resource,
      query
    );

    if (getConfig().saveAuditEvents && resource?.resourceType !== 'AuditEvent') {
      auditEvent.id = randomUUID();
      this.updateResourceImpl(auditEvent, true).catch(console.error);
    }
  }
}

export function isIndexTable(resourceType: string, searchParam: SearchParameter): boolean {
  return !!getLookupTable(resourceType, searchParam);
}

export function getLookupTable(resourceType: string, searchParam: SearchParameter): LookupTable<unknown> | undefined {
  for (const lookupTable of lookupTables) {
    if (lookupTable.isIndexed(searchParam, resourceType)) {
      return lookupTable;
    }
  }
  return undefined;
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
async function getCacheEntries(references: Reference[]): Promise<(CacheEntry | undefined)[]> {
  const referenceKeys = references.map((r) => r.reference as string);
  if (referenceKeys.length === 0) {
    // Return early to avoid calling mget() with no args, which is an error
    return [];
  }
  return (await getRedis().mget(...referenceKeys)).map((cachedValue) =>
    cachedValue ? (JSON.parse(cachedValue) as CacheEntry) : undefined
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

export const systemRepo = new Repository({
  superAdmin: true,
  strictMode: true,
  extendedMode: true,
  author: {
    reference: 'system',
  },
});
