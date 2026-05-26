// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BackgroundJobInteraction, Filter, SearchRequest, WithId } from '@medplum/core';
import {
  AccessPolicyInteraction,
  accessPolicySupportsInteraction,
  allOk,
  append,
  badRequest,
  deepClone,
  deepEquals,
  DEFAULT_MAX_SEARCH_COUNT,
  EMPTY,
  evalFhirPathTyped,
  extractAccountReferences,
  forbidden,
  formatSearchQuery,
  getStatus,
  gone,
  isGone,
  isNotFound,
  isOk,
  isResource,
  isResourceType,
  isResourceWithId,
  isUUID,
  normalizeErrorString,
  normalizeOperationOutcome,
  notFound,
  OperationOutcomeError,
  parseReference,
  parseSearchRequest,
  preconditionFailed,
  projectAdminResourceTypes,
  protectedResourceTypes,
  readInteractions,
  resolveId,
  satisfiedAccessPolicy,
  sleep,
  stringify,
  validateResourceType,
} from '@medplum/core';
import type {
  CreateResourceOptions,
  ReadHistoryOptions,
  RepositoryMode,
  UpdateResourceOptions,
} from '@medplum/fhir-router';
import { FhirRepository } from '@medplum/fhir-router';
import type {
  AccessPolicy,
  AccessPolicyResource,
  Binary,
  Bundle,
  BundleEntry,
  Meta,
  OperationOutcome,
  Project,
  Reference,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Pool, PoolClient } from 'pg';
import type { Operation } from 'rfc6902';
import { getConfig } from '../config/loader';
import { syntheticR4Project } from '../constants';
import { AuthenticatedRequestContext, tryGetRequestContext } from '../context';
import { DatabaseMode } from '../database';
import { getLogger } from '../logger';
import { incrementCounter, recordHistogramValue } from '../otel/otel';
import {
  cleanupUserSubs,
  getUserActiveWebSocketSubscriptionCount,
  removeActiveSubscriptions,
  removeUserActiveWebSocketSubscriptions,
} from '../pubsub';
import { getBinaryStorage } from '../storage/loader';
import type { AuditEventSubtype } from '../util/auditevent';
import {
  AuditEventOutcome,
  createAuditEvent,
  CreateInteraction,
  DeleteInteraction,
  HistoryInteraction,
  logAuditEvent,
  PatchInteraction,
  ReadInteraction,
  RestfulOperationType,
  SearchInteraction,
  UpdateInteraction,
  VreadInteraction,
} from '../util/auditevent';
import { patchObject } from '../util/patch';
import { addBackgroundJobs } from '../workers';
import { addSubscriptionJobs } from '../workers/subscription';
import { checkWebSocketSubscriptionLimit } from '../ws/subscriptions';
import type { FhirRateLimiter } from './fhirquota';
import { clamp } from './operations/utils/parameters';
import { getPatients } from './patient';
import { preCommitValidation } from './precommit';
import { replaceConditionalReferences, validateResourceReferences } from './references';
import { removeField } from './repository/field-utils';
import { removeCachedProfile } from './repository/profile-cache';
import type { StatementTimeoutOptions } from './repository/repository-connection';
import { RepositoryConnection } from './repository/repository-connection';
import type { CacheEntry } from './repository/resource-cache';
import {
  deleteResourceCacheEntries,
  deleteResourceCacheEntry,
  getResourceCacheEntries,
  getResourceCacheEntry,
  setResourceCacheEntry,
} from './repository/resource-cache';
import { buildDeletedResourceRow, buildResourceRow } from './repository/row-builder';
import { validateRepositoryResource } from './repository/validation';
import type { ResourceCap } from './resource-cap';
import { getFullUrl } from './response';
import { rewriteAttachments, RewriteMode } from './rewrite';
import type { SearchOptions } from './search';
import { buildSearchExpression, searchByReferenceImpl, searchImpl } from './search';
import { lookupTables } from './searchparameter';
import { GLOBAL_SHARD_ID } from './sharding';
import type { Expression } from './sql';
import { Condition, DeleteQuery, Disjunction, InsertQuery, SelectQuery } from './sql';

export type { StatementTimeoutOptions } from './repository/repository-connection';

/**
 * The RepositoryContext interface defines standard metadata for repository actions.
 * In practice, there will be one Repository per HTTP request.
 * And the RepositoryContext represents the context of that request,
 * such as "who is the current user?" and "what is the current project?"
 */
export interface RepositoryContext {
  /**
   * The shard ID for this repository. Currently ignored.
   * Defaults to GLOBAL_SHARD_ID if not specified.
   */
  shardId?: string;

  /**
   * The current author reference.
   * This should be a FHIR reference string (i.e., "resourceType/id").
   * Where resource type is ClientApplication, Patient, Practitioner, etc.
   * This value will be included in every resource as meta.author.
   */
  author: Reference;

  /**
   * Optional individual, device, or organization for whom the change was made.
   * This value will be included in every resource as meta.onBehalfOf.
   */
  onBehalfOf?: Reference;

  remoteAddress?: string;

  /**
   * Projects that the Repository is allowed to access.
   * This should include the ID/UUID of the current project, but may also include other accessory Projects.
   * If this is undefined, the current user is a server user (e.g. Super Admin)
   * The usual case has two elements: the user's Project and the base R4 Project
   * The user's "primary" Project will be the first element in the array (i.e. projects[0])
   * This value will be included in every resource as meta.project.
   */
  projects?: WithId<Project>[];

  /** Current Project of the authenticated user, or none for the system repository. */
  currentProject?: WithId<Project>;

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

  validateTerminology?: boolean;

  /**
   * Optional flag to include Medplum extended meta fields.
   * Medplum tracks additional metadata for each resource, such as:
   * 1) "author" - Reference to the last user who modified the resource.
   * 2) "project" - Reference to the project that owns the resource.
   * 3) "compartment" - References to all compartments the resource is in.
   */
  extendedMode?: boolean;

  /**
   * Optional flag to skip scheduling background jobs for writes.
   */
  skipBackgroundJobs?: boolean;
}

export interface InteractionOptions {
  verbose?: boolean;
}

export interface ReadResourceOptions extends InteractionOptions {
  checkCacheOnly?: boolean;
}

export interface ResendSubscriptionsOptions extends InteractionOptions {
  interaction?: BackgroundJobInteraction;
  subscription?: string;
}

export interface ProcessAllResourcesOptions {
  delayBetweenPagesMs?: number;
}

function addSyntheticR4ProjectIfMissing(context: RepositoryContext): void {
  if (context.projects && !context.projects.some((project) => project.id === syntheticR4Project.id)) {
    // Repositories with a project scope can also see the synthetic R4 project,
    // but repeated construction from the same context must not append duplicates.
    context.projects.push(syntheticR4Project);
  }
}

/**
 * The Repository class manages reading and writing to the FHIR repository.
 * It is a thin layer on top of the database.
 * Repository instances should be created per author and project.
 */
export class Repository extends FhirRepository implements Disposable {
  private readonly context: RepositoryContext;
  private readonly connection: RepositoryConnection;
  private readonly ownsConnection: boolean;
  private transactionChildRepo?: this;
  private closed = false;

  /**
   * The version to be set on resources when they are inserted/updated into the database.
   * The value should be incremented each time there is a change in the schema (really just columns)
   * of the resource tables or when there are code changes to `buildResourceRow`.
   *
   * Version history:
   *
   *  1. 02/27/25 - Added `__version` column (https://github.com/medplum/medplum/pull/6033)
   *  2. 04/09/25 - Added qualification-code search param for `Practitioner` (https://github.com/medplum/medplum/pull/6280)
   *  3. 04/09/25 - Added __tokens column for `token-column` search strategy (https://github.com/medplum/medplum/pull/6291)
   *  4. 04/25/25 - Consider `resource.id` in lookup table batch reindex (https://github.com/medplum/medplum/pull/6479)
   *  5. 04/29/25 - Added `status` param for `Flag` resources (https://github.com/medplum/medplum/pull/6500)
   *  6. 06/12/25 - Added columns per token search parameter (https://github.com/medplum/medplum/pull/6727)
   *  7. 06/25/25 - Added search params `ProjectMembership-identifier`, `Immunization-encounter`, `AllergyIntolerance-encounter` (https://github.com/medplum/medplum/pull/6868)
   *  8. 08/06/25 - Added Task to Patient compartment (https://github.com/medplum/medplum/pull/7194)
   *  9. 08/19/25 - Added search parameter `ServiceRequest-reason-code` (https://github.com/medplum/medplum/pull/7271)
   * 10. 08/27/25 - Added HumanName sort columns (https://github.com/medplum/medplum/pull/7304)
   * 11. 09/25/25 - Added ConceptMapping lookup table (https://github.com/medplum/medplum/pull/7469)
   * 12. 12/01/25 - Added search param `Bot-cds-hook` (https://github.com/medplum/medplum/pull/7933)
   * 13. 01/05/25 - Added search params: ActivityDefinition-code, Communication-priority, Communication-priority-order, ProjectMembership-active (https://github.com/medplum/medplum/pull/8160)
   * 14. 04/14/26 - Added search params: ProjectMembership-admin, Practitioner-qualification-code (https://github.com/medplum/medplum/pull/8919)
   *                and sort inline array columns (https://github.com/medplum/medplum/pull/8961)
   * 15. 05/19/26 - Added range-column search strategy (https://github.com/medplum/medplum/pull/9159)
   *                Project.features (https://github.com/medplum/medplum/pull/9049)
   *                Login.preAuthorizedCodeHash (https://github.com/medplum/medplum/pull/9231)
   *                Project.link (https://github.com/medplum/medplum/pull/9159)
   */
  static readonly VERSION: number = 15;

  constructor(context: RepositoryContext, connection?: RepositoryConnection) {
    super();
    addSyntheticR4ProjectIfMissing(context);
    this.context = context;
    this.ownsConnection = connection === undefined;
    this.connection = connection ?? new RepositoryConnection();
    if (!this.context.author?.reference) {
      throw new Error('Invalid author reference');
    }
  }

  get mode(): RepositoryMode {
    return this.connection.mode;
  }

  /**
   * Convenience method to create a new repository with the same context but a new connection.
   * @returns A new repository with the same context but a new connection.
   */
  clone(): Repository {
    this.assertUsable(); // technically not needed, but the implementation has been a moving target, so keep it locked down
    return new Repository(this.context);
  }

  private createTransactionScopedRepo(): this {
    // create the exact class, e.g. SystemRepository, of the current instance.
    const RepositoryConstructor = this.constructor as new (
      context: RepositoryContext,
      connection?: RepositoryConnection
    ) => this;
    return new RepositoryConstructor(this.context, this.connection);
  }

  get shardId(): string {
    return this.context.shardId ?? GLOBAL_SHARD_ID;
  }

  /**
   * Use this when you need elevated privileges within request handling.
   * This reuses the same DB connection, if one exists, to stay within the same transaction.
   * @returns a SystemRepository for the same shard as this repository.
   */
  getSystemRepo(): SystemRepository {
    this.assertUsable();
    const contextDefaults = {
      skipBackgroundJobs: this.context.skipBackgroundJobs,
    };
    if (this.connection.hasConnection()) {
      return createSystemRepository(this.shardId, this.connection, contextDefaults);
    }
    return createSystemRepository(this.shardId, undefined, contextDefaults);
  }

  setMode(mode: RepositoryMode): void {
    this.assertUsable();
    this.connection.mode = mode;
  }

  private rateLimiter(): FhirRateLimiter | undefined {
    return this.isSuperAdmin() ? undefined : tryGetRequestContext()?.fhirRateLimiter;
  }

  private resourceCap(): ResourceCap | undefined {
    const context = tryGetRequestContext();
    return !this.isSuperAdmin() && context instanceof AuthenticatedRequestContext ? context.resourceCap : undefined;
  }

  currentProject(): WithId<Project> | undefined {
    return this.context.currentProject;
  }

  effectiveAccessPolicy(): Readonly<AccessPolicy> | undefined {
    return this.context.accessPolicy;
  }

  /**
   * Returns a project by ID.
   * This handles the common case where the project ID is the same as the current project ID,
   * but also supports the super admin case where the project ID is different.
   * @param projectId - The project ID to look up.
   * @returns The project, or undefined if not found.
   */
  private async getProjectById(projectId: string | undefined): Promise<WithId<Project> | undefined> {
    if (!projectId) {
      return undefined;
    }
    if (projectId === this.context.currentProject?.id) {
      return this.context.currentProject;
    }
    return this.getSystemRepo().readResource<Project>('Project', projectId);
  }

  override async createResource<T extends Resource>(resource: T, options?: CreateResourceOptions): Promise<WithId<T>> {
    this.assertUsable();
    await this.rateLimiter()?.recordWrite();
    await this.resourceCap()?.created();

    if (options?.assignedId && resource.id && !this.context.superAdmin) {
      // NB: To be removed after proper client assigned ID support is added
      const systemRepo = this.getSystemRepo();
      try {
        const existing = await systemRepo.readResourceImpl(resource.resourceType, resource.id);
        if (existing) {
          throw new Error('Assigned ID is already in use');
        }
      } catch (err) {
        if (!isNotFound(normalizeOperationOutcome(err))) {
          throw err;
        }
      }
    }

    const resourceWithId = {
      ...resource,
      id: options?.assignedId && resource.id ? resource.id : this.generateId(),
    };
    const startTime = Date.now();
    try {
      const result = await this.updateResourceImpl(resourceWithId, true);
      const durationMs = Date.now() - startTime;

      await this.postCommit(async () => {
        this.logEvent(CreateInteraction, AuditEventOutcome.Success, undefined, { resource: result, durationMs });
      });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(CreateInteraction, AuditEventOutcome.MinorFailure, err, {
        durationMs,
        resource: { type: resource.resourceType },
      });
      throw err;
    }
  }

  generateId(): string {
    return randomUUID();
  }

  override async readResource<T extends Resource>(
    resourceType: T['resourceType'],
    id: string,
    options?: ReadResourceOptions
  ): Promise<WithId<T>> {
    this.assertUsable();
    await this.rateLimiter()?.recordRead();

    const startTime = Date.now();
    try {
      const result = this.removeHiddenFields(await this.readResourceImpl<T>(resourceType, id, options));
      const durationMs = Date.now() - startTime;
      this.logEvent(ReadInteraction, AuditEventOutcome.Success, undefined, { resource: result, durationMs });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(ReadInteraction, AuditEventOutcome.MinorFailure, err, {
        resource: { reference: `${resourceType}/${id}` },
        durationMs,
      });
      throw err;
    }
  }

  private async readResourceImpl<T extends Resource>(
    resourceType: T['resourceType'],
    id: string,
    options?: ReadResourceOptions
  ): Promise<WithId<T>> {
    if (!id || !isUUID(id)) {
      throw new OperationOutcomeError(notFound);
    }

    validateResourceType(resourceType);

    if (!this.supportsInteraction(AccessPolicyInteraction.READ, resourceType)) {
      throw new OperationOutcomeError(forbidden);
    }

    const cacheRecord = await this.getCacheEntry<T>(resourceType, id);
    if (cacheRecord) {
      // This is an optimization to avoid a database query.
      // However, it depends on all values in the cache having "meta.compartment"
      // Old versions of Medplum did not populate "meta.compartment"
      // So this optimization is blocked until we add a migration.
      // if (!this.canReadCacheEntry(cacheRecord)) {
      //   throw new OperationOutcomeError(notFound);
      // }
      if (this.canPerformInteraction(AccessPolicyInteraction.READ, cacheRecord.resource)) {
        return cacheRecord.resource;
      }
    }

    if (options?.checkCacheOnly) {
      throw new OperationOutcomeError(notFound);
    }

    return this.readResourceFromDatabase(resourceType, id);
  }

  private async readResourceFromDatabase<T extends Resource>(resourceType: string, id: string): Promise<T> {
    if (!isUUID(id)) {
      throw new OperationOutcomeError(notFound);
    }

    const builder = new SelectQuery(resourceType).column('content').column('deleted').where('id', '=', id);

    this.addSecurityFilters(builder, resourceType, AccessPolicyInteraction.READ);

    const rows = await builder.execute(this.getDatabaseClient(DatabaseMode.READER));
    if (rows.length === 0) {
      throw new OperationOutcomeError(notFound);
    }

    if (rows[0].deleted) {
      throw new OperationOutcomeError(gone);
    }

    const resource = JSON.parse(rows[0].content as string) as WithId<T>;

    if (!this.connection.isInTransaction()) {
      // Only set cache entry if not in a transaction
      await this.setCacheEntry(resource);
    }

    return resource;
  }

  override async readReferences<T extends Resource>(references: Reference<T>[]): Promise<(WithId<T> | Error)[]> {
    this.assertUsable();
    await this.rateLimiter()?.recordRead(references.length);
    const cacheEntries = await this.getCacheEntries(references);
    const result: (WithId<T> | Error)[] = new Array(references.length);

    for (let i = 0; i < result.length; i++) {
      const startTime = Date.now();
      const reference = references[i];
      const cacheEntry = cacheEntries[i];
      let entryResult = await this.processReadReferenceEntry(reference, cacheEntry);
      const durationMs = Date.now() - startTime;

      if (entryResult instanceof Error) {
        const reference = references[i];
        this.logEvent(ReadInteraction, AuditEventOutcome.MinorFailure, entryResult, {
          resource: reference,
          durationMs,
        });
      } else {
        entryResult = this.removeHiddenFields(entryResult);
        this.logEvent(ReadInteraction, AuditEventOutcome.Success, undefined, { resource: entryResult, durationMs });
      }
      result[i] = entryResult as WithId<T> | Error;
    }

    return result;
  }

  private async processReadReferenceEntry(
    reference: Reference,
    cacheEntry: CacheEntry | undefined
  ): Promise<Resource | Error> {
    if (!reference.reference?.match(/^[A-Z][a-zA-Z]+\//)) {
      // Non-local references cannot be resolved
      return new OperationOutcomeError(notFound);
    }

    try {
      const [resourceType, id] = parseReference(reference);
      validateResourceType(resourceType);

      if (!this.supportsInteraction(AccessPolicyInteraction.READ, resourceType)) {
        return new OperationOutcomeError(forbidden);
      }

      if (cacheEntry) {
        if (!this.canPerformInteraction(AccessPolicyInteraction.READ, cacheEntry.resource)) {
          return new OperationOutcomeError(notFound);
        }
        return cacheEntry.resource;
      }
      return await this.readResourceFromDatabase(resourceType, id);
    } catch (err) {
      if (err instanceof OperationOutcomeError) {
        if (isNotFound(err.outcome) || isGone(err.outcome)) {
          // Only return "not found" or "gone" errors
          return err;
        }
        // Other errors should be treated as database errors
        throw err;
      }
      throw new OperationOutcomeError(normalizeOperationOutcome(err), { cause: err });
    }
  }

  override async readReference<T extends Resource>(reference: Reference<T>): Promise<WithId<T>> {
    this.assertUsable();
    let parts: [T['resourceType'], string];
    try {
      parts = parseReference(reference);
    } catch {
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
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   * @param options - The read history options.
   * @returns Operation outcome and a history bundle.
   */
  async readHistory<T extends Resource>(
    resourceType: T['resourceType'],
    id: string,
    options?: ReadHistoryOptions
  ): Promise<Bundle<T>> {
    this.assertUsable();
    await this.rateLimiter()?.recordHistory();
    const startTime = Date.now();
    try {
      let resource: T | undefined = undefined;
      try {
        resource = await this.readResourceImpl<T>(resourceType, id);
        if (!this.canPerformInteraction(AccessPolicyInteraction.HISTORY, resource)) {
          throw new OperationOutcomeError(forbidden);
        }
      } catch (err) {
        if (!(err instanceof OperationOutcomeError) || !isGone(err.outcome)) {
          throw err;
        }
      }

      if (options?.offset !== undefined) {
        const maxOffset = getConfig().maxSearchOffset;
        if (maxOffset !== undefined && options.offset > maxOffset) {
          throw new OperationOutcomeError(
            badRequest(`Search offset exceeds maximum (got ${options.offset}, max ${maxOffset})`)
          );
        }
      }

      const rows = await new SelectQuery(resourceType + '_History')
        .column('versionId')
        .column('id')
        .column('content')
        .column('lastUpdated')
        .where('id', '=', id)
        .orderBy('lastUpdated', true)
        .limit(clamp(0, options?.limit ?? 100, DEFAULT_MAX_SEARCH_COUNT))
        .offset(Math.max(0, options?.offset ?? 0))
        .execute(this.getDatabaseClient(DatabaseMode.READER));

      const countRows = await new SelectQuery(resourceType + '_History')
        .raw('COUNT(*)::int AS "count"')
        .where('id', '=', id)
        .execute(this.getDatabaseClient(DatabaseMode.READER));

      const totalCount = countRows[0].count as number;

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

      const durationMs = Date.now() - startTime;
      this.logEvent(HistoryInteraction, AuditEventOutcome.Success, undefined, { resource, durationMs });
      return {
        resourceType: 'Bundle',
        type: 'history',
        entry: entries,
        total: totalCount,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(HistoryInteraction, AuditEventOutcome.MinorFailure, err, {
        resource: { reference: `${resourceType}/${id}` },
        durationMs,
      });
      throw err;
    }
  }

  override async readVersion<T extends Resource>(
    resourceType: T['resourceType'],
    id: string,
    vid: string
  ): Promise<WithId<T>> {
    this.assertUsable();
    await this.rateLimiter()?.recordRead();
    const startTime = Date.now();
    const versionReference = { reference: `${resourceType}/${id}/_history/${vid}` };
    try {
      if (!isUUID(id) || !isUUID(vid)) {
        throw new OperationOutcomeError(notFound);
      }

      try {
        const resource = await this.readResourceImpl<T>(resourceType, id);
        if (!this.canPerformInteraction(AccessPolicyInteraction.VREAD, resource)) {
          throw new OperationOutcomeError(forbidden);
        }
      } catch (err) {
        if (!isGone(normalizeOperationOutcome(err))) {
          throw err;
        }
      }

      const rows = await new SelectQuery(resourceType + '_History')
        .column('content')
        .where('id', '=', id)
        .where('versionId', '=', vid)
        .execute(this.getDatabaseClient(DatabaseMode.READER));

      if (rows.length === 0) {
        throw new OperationOutcomeError(notFound);
      }

      const result = this.removeHiddenFields(JSON.parse(rows[0].content as string));
      const durationMs = Date.now() - startTime;
      this.logEvent(VreadInteraction, AuditEventOutcome.Success, undefined, { resource: versionReference, durationMs });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(VreadInteraction, AuditEventOutcome.MinorFailure, err, { resource: versionReference, durationMs });
      throw err;
    }
  }

  override async updateResource<T extends Resource>(resource: T, options?: UpdateResourceOptions): Promise<WithId<T>> {
    this.assertUsable();
    await this.rateLimiter()?.recordWrite();

    const startTime = Date.now();
    try {
      let result: WithId<T>;
      if (options?.ifMatch) {
        // Conditional update requires transaction
        result = await this.withTransaction((txRepo) => txRepo.updateResourceImpl(resource, false, options));
      } else {
        result = await this.updateResourceImpl(resource, false, options);
      }
      const durationMs = Date.now() - startTime;
      await this.postCommit(async () => {
        this.logEvent(UpdateInteraction, AuditEventOutcome.Success, undefined, { resource: result, durationMs });
      });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(UpdateInteraction, AuditEventOutcome.MinorFailure, err, { resource, durationMs });
      throw err;
    }
  }

  private checkResourcePermissions<T extends Resource>(resource: T, interaction: AccessPolicyInteraction): WithId<T> {
    if (!isResourceWithId(resource)) {
      throw new OperationOutcomeError(badRequest('Missing id'));
    }
    const { resourceType, id } = resource;
    if (!isUUID(id)) {
      throw new OperationOutcomeError(badRequest('Invalid id'));
    }

    // Add default profiles before validating resource
    if (!resource.meta?.profile) {
      const defaultProfiles = this.currentProject()?.defaultProfile?.find(
        (o) => o.resourceType === resourceType
      )?.profile;
      if (defaultProfiles?.length) {
        resource.meta = { ...resource.meta, profile: defaultProfiles };
      }
    }
    if (!this.supportsInteraction(interaction, resourceType)) {
      throw new OperationOutcomeError(forbidden);
    }
    return resource;
  }

  private async updateResourceImpl<T extends Resource>(
    resource: T,
    create: boolean,
    options?: UpdateResourceOptions
  ): Promise<WithId<T>> {
    const interaction = create ? AccessPolicyInteraction.CREATE : AccessPolicyInteraction.UPDATE;
    let validatedResource = this.checkResourcePermissions(resource, interaction);
    const { resourceType, id } = validatedResource;

    const preCommitResult = await preCommitValidation(this, validatedResource, 'update');

    if (
      isResourceWithId(preCommitResult, validatedResource.resourceType) &&
      preCommitResult.id === validatedResource.id
    ) {
      validatedResource = this.checkResourcePermissions(preCommitResult, interaction);
    }

    const existing = create ? undefined : await this.checkExistingResource<T>(resourceType, id);
    if (existing) {
      (existing.meta as Meta).compartment = this.getCompartments(existing); // Update compartments with latest rules
      if (!this.canPerformInteraction(interaction, existing)) {
        // Check before the update
        throw new OperationOutcomeError(forbidden);
      }
      if (options?.ifMatch && existing.meta?.versionId !== options.ifMatch) {
        throw new OperationOutcomeError(preconditionFailed);
      }
    }

    let updated = await rewriteAttachments(RewriteMode.REFERENCE, this, {
      ...this.restoreReadonlyFields(validatedResource, existing),
    });
    updated = await replaceConditionalReferences(this, updated);

    const resultMeta: Meta = {
      ...updated.meta,
      versionId: this.generateId(),
      lastUpdated: this.getLastUpdated(existing, validatedResource),
      author: this.getAuthor(validatedResource),
      onBehalfOf: this.context.onBehalfOf,
    };

    const result = { ...updated, meta: resultMeta };

    const projectId = this.getProjectId(existing, updated);
    if (projectId) {
      resultMeta.project = projectId;
    }
    const accounts = await this.getAccounts(existing, updated);
    if (accounts) {
      resultMeta.account = accounts[0];
      resultMeta.accounts = accounts;
    }
    resultMeta.compartment = this.getCompartments(result);

    // Validate resource after all modifications and touchups above are done
    await validateRepositoryResource(this, result);
    // If this is a Subscription resource we are creating, we want to make sure the user is not over their per-user limit
    if (create && result.resourceType === 'Subscription' && result.channel?.type === 'websocket') {
      const projectId = result.meta?.project;
      const author = result.meta?.author?.reference;
      if (!(projectId && author)) {
        throw new OperationOutcomeError(badRequest('No project or author connected to the specified Subscription.'));
      }
      const project = await this.getProjectById(projectId);
      assert(project);
      try {
        await checkWebSocketSubscriptionLimit(project, author);
      } catch {
        await cleanupUserSubs(author);
        await checkWebSocketSubscriptionLimit(project, author);
      }
    }

    if (this.context.checkReferencesOnWrite) {
      await this.preCommit(async () => {
        await validateResourceReferences(this, result);
      });
    }

    if (this.isNotModified(existing, result)) {
      this.removeHiddenFields(existing);
      return existing;
    }

    if (!this.isResourceWriteable(existing, result, interaction)) {
      // Check after the update
      throw new OperationOutcomeError(forbidden);
    }

    await this.handleStorage(result, create);
    await this.postCommit(async () => this.handleBinaryUpdate(existing, result));
    if (!this.context.skipBackgroundJobs) {
      await this.postCommit(async () => {
        const project = await this.getProjectById(projectId);
        await addBackgroundJobs(result, existing, { project, interaction });
      });
    }

    const output = deepClone(result);
    return this.removeHiddenFields(output);
  }

  /**
   * Handles a Binary resource update.
   * If the resource has embedded base-64 data, writes the data to the binary storage.
   * Otherwise if the resource already exists, copies the existing binary to the new resource.
   * @param existing - Existing binary if it exists.
   * @param resource - The resource to write to the database.
   */
  private async handleBinaryUpdate<T extends Resource>(existing: T | undefined, resource: T): Promise<void> {
    if (resource.resourceType !== 'Binary') {
      return;
    }

    if (resource.data) {
      await this.handleBinaryData(resource);
    } else if (existing) {
      await getBinaryStorage().copyBinary(existing as Binary, resource);
    }
  }

  /**
   * Handles a Binary resource with embedded base-64 data.
   * Writes the data to the binary storage and removes the data field from the resource.
   * @param resource - The resource to write to the database.
   */
  private async handleBinaryData(resource: Binary): Promise<void> {
    // Parse result.data as a base64 string
    const buffer = Buffer.from(resource.data as string, 'base64');

    // base64 data should be limited in size
    const maxBase64Bytes = getConfig().base64BinaryMaxBytes;
    if (maxBase64Bytes && buffer.length > maxBase64Bytes) {
      throw new OperationOutcomeError(badRequest(`base64Binary exceeds ${maxBase64Bytes} bytes`));
    }
    // Convert buffer to a Readable stream
    const stream = new Readable({
      read() {
        this.push(buffer);
        this.push(null); // Signifies the end of the stream (EOF)
      },
    });

    // Write the stream to the binary storage
    await getBinaryStorage().writeBinary(resource, undefined, resource.contentType, stream);

    // Remove the data field from the resource
    resource.data = undefined;
  }

  /**
   * Handles persisting data to at-rest storage: cache and/or database.
   * This method handles all the special cases for storage, including cache invalidation.
   * @param resource - The resource to store.
   * @param create - Whether the resource is being create, or updated in place.
   */
  private async handleStorage(resource: WithId<Resource>, create: boolean): Promise<void> {
    if (!this.isCacheOnly(resource)) {
      await this.writeToDatabase(resource, create);
    }

    // Skip writing AuditEvents to cache, since they are written in high volume but are seldom read by ID
    if (resource.resourceType !== 'AuditEvent') {
      await this.setCacheEntry(resource);
    } else if (!create) {
      // Explicitly remove old AuditEvents from cache on update, to prevent stale reads from cache
      await this.deleteCacheEntry(resource.resourceType, resource.id);
    }

    // Handle special cases for resource caching
    if (resource.resourceType === 'Subscription' && resource.channel?.type === 'websocket' && create) {
      getLogger().info('[WS] Subscription created', {
        subscriptionId: resource.id,
        criteria: resource.criteria,
        user: resource.meta?.author?.reference,
      });
    }

    if (resource.resourceType === 'StructureDefinition') {
      await removeCachedProfile(resource);
    }
  }

  /**
   * Writes the resource to the database.
   * This is a single atomic operation inside of a transaction.
   * @param resource - The resource to write to the database.
   * @param create - If true, then the resource is being created.
   */
  private async writeToDatabase<T extends WithId<Resource>>(resource: T, create: boolean): Promise<void> {
    await this.ensureInTransaction(async (txRepo) => {
      const client = txRepo.getDatabaseClient(DatabaseMode.WRITER);
      await txRepo.writeResource(client, resource);
      await txRepo.writeResourceVersion(client, resource);
      await txRepo.writeLookupTables(client, resource, create);
    });
  }

  /**
   * Tries to return the existing resource, if it is available.
   * Handles the following cases:
   *  - Previous version exists
   *  - Previous version was deleted, and user is restoring it
   *  - Previous version does not exist, and user does not have permission to create by ID
   *  - Previous version does not exist, and user does have permission to create by ID
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   * @returns The existing resource, if found.
   */
  private async checkExistingResource<T extends Resource>(
    resourceType: T['resourceType'],
    id: string
  ): Promise<WithId<T> | undefined> {
    try {
      return await this.readResourceImpl<T>(resourceType, id);
    } catch (err) {
      const outcome = normalizeOperationOutcome(err);
      if (!isOk(outcome) && !isNotFound(outcome) && !isGone(outcome)) {
        throw new OperationOutcomeError(outcome, { cause: err });
      }

      if (isNotFound(outcome) && !this.canSetId()) {
        throw new OperationOutcomeError(outcome, { cause: err });
      }

      // Otherwise, it is ok if the resource is not found.
      // This is an "update" operation, and the outcome is "not-found" or "gone",
      // and the current user has permission to create a new version.
      return undefined;
    }
  }

  /**
   * Returns true if the resource is not modified from the existing resource.
   * @param existing - The existing resource.
   * @param updated - The updated resource.
   * @returns True if the resource is not modified.
   */
  private isNotModified<T extends Resource>(existing: T | undefined, updated: T): existing is T {
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
   * Reindexes the resource.
   * This is only available to the system and super admin accounts.
   * This should not result in any change to the resource or its history.
   * @param resourceType - The resource type.
   * @param id - The resource ID.
   * @returns Promise to complete.
   */
  async reindexResource<T extends Resource = Resource>(resourceType: T['resourceType'], id: string): Promise<void> {
    this.assertUsable();
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    await this.withTransaction(async (txRepo) => {
      const resource = await txRepo.readResourceImpl<T>(resourceType, id);
      return txRepo.reindexResources([resource]);
    });
  }

  /**
   * Internal implementation of reindexing a resource.
   * This accepts a resource as a parameter, rather than a resource type and ID.
   * When doing a bulk reindex, this will be more efficient because it avoids unnecessary reads.
   * @param resources - The resource(s) to reindex.
   */
  async reindexResources<T extends Resource>(resources: WithId<T>[]): Promise<void> {
    this.assertUsable();
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    // Since the page size could be relatively large (1k+), preferring a simple for loop with re-used variables
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i];
      const meta = resource.meta as Meta;
      meta.compartment = this.getCompartments(resource);

      if (!meta.project) {
        const projectRef = meta.compartment.find((r) => r.reference?.startsWith('Project/'));
        meta.project = resolveId(projectRef);
      }
    }

    await this.batchWriteLookupTables(resources, false);
    await this.batchWriteResources(resources);
  }

  /**
   * Resends subscriptions for the resource.
   * This is only available to the admin accounts.
   * This should not result in any change to the resource or its history.
   * @param resourceType - The resource type.
   * @param id - The resource ID.
   * @param options - Additional options.
   * @returns Promise to complete.
   */
  async resendSubscriptions<T extends Resource = Resource>(
    resourceType: T['resourceType'],
    id: string,
    options?: ResendSubscriptionsOptions
  ): Promise<void> {
    this.assertUsable();
    if (!this.isSuperAdmin() && !this.isProjectAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    const resource = await this.readResourceImpl<T>(resourceType, id);
    const interaction = options?.interaction ?? 'update';
    let previousVersion: T | undefined;

    if (interaction === 'update') {
      const history = await this.readHistory(resourceType, id, { limit: 2 });
      if (history.entry?.[0]?.resource?.meta?.versionId !== resource.meta?.versionId) {
        throw new OperationOutcomeError(preconditionFailed);
      }
      previousVersion = history.entry?.[1]?.resource;
    }

    return addSubscriptionJobs(
      resource,
      previousVersion,
      {
        project: await this.getProjectById(resource.meta?.project),
        interaction,
      },
      options
    );
  }

  override async deleteResource<T extends Resource = Resource>(
    resourceType: T['resourceType'],
    id: string
  ): Promise<void> {
    this.assertUsable();
    await this.rateLimiter()?.recordWrite();

    const startTime = Date.now();
    let resource: WithId<T>;
    try {
      resource = await this.readResourceImpl<T>(resourceType, id);
    } catch (err) {
      const outcomeErr = err as OperationOutcomeError;
      if (isGone(outcomeErr.outcome)) {
        return; // Resource is already deleted, return successfully
      }
      throw err;
    }

    try {
      if (!this.canPerformInteraction(AccessPolicyInteraction.DELETE, resource)) {
        throw new OperationOutcomeError(forbidden);
      }

      await preCommitValidation(this, resource, 'delete');

      await this.deleteCacheEntry(resourceType, id);

      // Clean up per-user and project active sets for deleted WebSocket subscriptions
      if (resource.resourceType === 'Subscription' && resource.channel?.type === 'websocket') {
        const author = resource.meta?.author?.reference;
        const projectId = resource.meta?.project;
        const criteriaResourceType = resource.criteria?.split('?')[0];
        const cleanupPromises: Promise<number>[] = [];
        if (author) {
          cleanupPromises.push(removeUserActiveWebSocketSubscriptions(author, [`Subscription/${id}`]));
        }
        if (projectId && criteriaResourceType && isResourceType(criteriaResourceType)) {
          cleanupPromises.push(removeActiveSubscriptions(projectId, criteriaResourceType, [`Subscription/${id}`]));
        }
        await Promise.all(cleanupPromises);
        if (author) {
          const userSubCount = await getUserActiveWebSocketSubscriptionCount(author);
          getLogger().info('[WS] Subscription deleted', {
            subscriptionId: resource.id,
            user: author,
            userSubscriptions: userSubCount,
          });
        }
      }

      if (!this.isCacheOnly(resource)) {
        await this.ensureInTransaction(async (txRepo) => {
          const columns = buildDeletedResourceRow(resourceType, id, resource.meta?.project);

          const client = txRepo.getDatabaseClient(DatabaseMode.WRITER);
          await new InsertQuery(resourceType, [columns]).mergeOnConflict().execute(client);

          await new InsertQuery(resourceType + '_History', [
            {
              id,
              versionId: txRepo.generateId(),
              lastUpdated: columns.lastUpdated,
              content: columns.content,
            },
          ]).execute(client);

          await txRepo.deleteFromLookupTables(client, resource);
          const durationMs = Date.now() - startTime;

          await txRepo.postCommit(async () => {
            txRepo.logEvent(DeleteInteraction, AuditEventOutcome.Success, undefined, { resource, durationMs });
          });
        });
      }

      if (!this.context.skipBackgroundJobs) {
        await addBackgroundJobs(resource, resource, {
          project: await this.getProjectById(resource.meta?.project),
          interaction: 'delete',
        });
      }
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(DeleteInteraction, AuditEventOutcome.MinorFailure, err, {
        resource: { reference: `${resourceType}/${id}` },
        durationMs,
      });
      throw err;
    }
  }

  override async patchResource<T extends Resource>(
    resourceType: T['resourceType'],
    id: string,
    patch: Operation[],
    options?: UpdateResourceOptions
  ): Promise<WithId<T>> {
    this.assertUsable();
    await this.rateLimiter()?.recordWrite();

    const startTime = Date.now();
    try {
      return await this.ensureInTransaction(async (txRepo) => {
        const resource = await txRepo.readResourceFromDatabase<T>(resourceType, id);

        if (resource.resourceType !== resourceType) {
          throw new OperationOutcomeError(badRequest('Incorrect resource type'));
        }
        if (resource.id !== id) {
          throw new OperationOutcomeError(badRequest('Incorrect ID'));
        }

        patchObject(resource, patch);

        const result = await txRepo.updateResourceImpl(resource, false, options);
        const durationMs = Date.now() - startTime;

        await txRepo.postCommit(async () => {
          txRepo.logEvent(PatchInteraction, AuditEventOutcome.Success, undefined, { resource: result, durationMs });
        });
        return result;
      });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(PatchInteraction, AuditEventOutcome.MinorFailure, err, {
        resource: { reference: `${resourceType}/${id}` },
        durationMs,
      });
      throw err;
    }
  }

  /**
   * Permanently deletes the specified resource and all of its history.
   * This is only available to the system and super admin accounts.
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   */
  async expungeResource(resourceType: string, id: string): Promise<void> {
    this.assertUsable();
    await this.expungeResources(resourceType, [id]);
  }

  /**
   * Permanently deletes the specified resources and all of its history.
   * This is only available to the system and super admin accounts.
   * @param resourceType - The FHIR resource type.
   * @param ids - The resource IDs.
   */
  async expungeResources(resourceType: string, ids: string[]): Promise<void> {
    this.assertUsable();
    if (!this.isSuperAdmin() && !this.isProjectAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }
    if (ids.length === 0) {
      return;
    }
    if (ids.length > 10000) {
      throw new OperationOutcomeError(badRequest('Expunge request contains too many IDs'));
    }

    const projectId = this.isSuperAdmin() ? undefined : this.context.currentProject?.id;
    const deletedIds = await this.withTransaction<string[]>(
      async (txRepo) => {
        const deleteQuery = new DeleteQuery(resourceType).where('id', 'IN', ids).returning('id');
        if (projectId) {
          deleteQuery.where('projectId', '=', projectId);
        }
        const client = txRepo.getDatabaseClient(DatabaseMode.WRITER);
        const deleteResult = await deleteQuery.execute<{ id: string }>(client);
        if (deleteResult.length === 0) {
          return [];
        }

        const deletedIds = new Array<string>(deleteResult.length);
        for (let i = 0; i < deleteResult.length; i++) {
          const res = deleteResult[i];
          deletedIds[i] = res.id;
          await txRepo.deleteFromLookupTables(client, { resourceType, id: res.id } as WithId<Resource>);
        }

        await new DeleteQuery(resourceType + '_History').where('id', 'IN', deletedIds).execute(client);
        await txRepo.postCommit(() => txRepo.deleteCacheEntries(resourceType, deletedIds));
        return deletedIds;
      },
      { serializable: true }
    );
    incrementCounter(
      `medplum.fhir.interaction.delete.count`,
      { attributes: { resourceType, result: 'success' } },
      deletedIds.length
    );
    await this.resourceCap()?.deleted(deletedIds.length);
  }

  /**
   * Purges resources of the specified type that were last updated before the specified date.
   * This is only available to the system and super admin accounts.
   * @param resourceType - The FHIR resource type.
   * @param before - The date before which resources should be purged.
   */
  async purgeResources(resourceType: ResourceType, before: string): Promise<void> {
    this.assertUsable();
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    const client = this.getDatabaseClient(DatabaseMode.WRITER);

    // Delete from lookup tables first
    // These operations use the main resource table for lastUpdated, so must come first
    for (const lookupTable of lookupTables) {
      await lookupTable.purgeValuesBefore(client, resourceType, before);
    }

    await new DeleteQuery(resourceType).where('lastUpdated', '<=', before).execute(client);
    await new DeleteQuery(resourceType + '_History').where('lastUpdated', '<=', before).execute(client);
  }

  override async search<T extends Resource>(
    searchRequest: SearchRequest<T>,
    options?: SearchOptions
  ): Promise<Bundle<WithId<T>>> {
    this.assertUsable();
    await this.rateLimiter()?.recordSearch();

    const startTime = Date.now();
    try {
      // Resource type validation is performed in the searchImpl function
      const result = await searchImpl(this, searchRequest, options);
      const durationMs = Date.now() - startTime;
      this.logEvent(SearchInteraction, AuditEventOutcome.Success, undefined, { searchRequest, durationMs });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(SearchInteraction, AuditEventOutcome.MinorFailure, err, { searchRequest, durationMs });
      throw err;
    }
  }

  async processAllResources<T extends Resource>(
    initialSearchRequest: SearchRequest<T>,
    process: (resource: WithId<T>) => Promise<void>,
    options?: ProcessAllResourcesOptions
  ): Promise<void> {
    this.assertUsable();
    let searchRequest: SearchRequest<T> | undefined = initialSearchRequest;
    while (searchRequest) {
      const bundle: Bundle<T> = await this.search<T>(searchRequest);
      if (!bundle.entry?.length) {
        break;
      }
      for (const entry of bundle.entry) {
        if (entry.resource?.id) {
          await process(entry.resource as WithId<T>);
        }
      }
      const nextLink = bundle.link?.find((b) => b.relation === 'next');
      if (nextLink) {
        searchRequest = parseSearchRequest<T>(nextLink.url);
        if (options?.delayBetweenPagesMs) {
          await sleep(options.delayBetweenPagesMs);
        }
      } else {
        searchRequest = undefined;
      }
    }
  }

  override async searchByReference<T extends Resource>(
    searchRequest: SearchRequest<T>,
    referenceField: string,
    references: string[]
  ): Promise<Record<string, WithId<T>[]>> {
    this.assertUsable();
    await this.rateLimiter()?.recordSearch(references.length);
    const startTime = Date.now();
    try {
      const result = await searchByReferenceImpl(this, searchRequest, referenceField, references);
      const durationMs = Date.now() - startTime;
      for (const ref of references) {
        const refFilter: Filter = { code: referenceField, operator: 'eq', value: ref };
        const refSearch: SearchRequest = {
          ...searchRequest,
          filters: searchRequest.filters ? [...searchRequest.filters, refFilter] : [refFilter],
        };
        this.logEvent(SearchInteraction, AuditEventOutcome.Success, undefined, {
          searchRequest: refSearch,
          durationMs,
        });
      }
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(SearchInteraction, AuditEventOutcome.MinorFailure, err, { searchRequest, durationMs });
      throw err;
    }
  }

  override async searchOne<T extends Resource>(searchRequest: SearchRequest<T>): Promise<WithId<T> | undefined> {
    this.assertUsable();
    return super.searchOne(searchRequest);
  }

  override async searchResources<T extends Resource>(searchRequest: SearchRequest<T>): Promise<WithId<T>[]> {
    this.assertUsable();
    return super.searchResources(searchRequest);
  }

  override async conditionalCreate<T extends Resource>(
    resource: T,
    search: SearchRequest<T>,
    options?: CreateResourceOptions
  ): Promise<{ resource: WithId<T>; outcome: OperationOutcome }> {
    this.assertUsable();
    return super.conditionalCreate(resource, search, options);
  }

  override async conditionalUpdate<T extends Resource>(
    resource: T,
    search: SearchRequest,
    options?: CreateResourceOptions & UpdateResourceOptions
  ): Promise<{ resource: WithId<T>; outcome: OperationOutcome }> {
    this.assertUsable();
    return super.conditionalUpdate(resource, search, options);
  }

  override async conditionalDelete(search: SearchRequest): Promise<void> {
    this.assertUsable();
    return super.conditionalDelete(search);
  }

  override async conditionalPatch(search: SearchRequest, patch: Operation[]): Promise<WithId<Resource>> {
    this.assertUsable();
    return super.conditionalPatch(search, patch);
  }

  /**
   * Adds filters to ignore soft-deleted resources.
   * @param builder - The select query builder.
   */
  addDeletedFilter(builder: SelectQuery): void {
    builder.where('deleted', '=', false);
  }

  /**
   * Adds security filters to the select query.
   * @param builder - The select query builder.
   * @param resourceType - The resource type for compartments.
   * @param interaction - The FHIR interaction being performed.
   */
  addSecurityFilters(builder: SelectQuery, resourceType: string, interaction: AccessPolicyInteraction): void {
    // No compartment restrictions for admins.
    if (!this.isSuperAdmin()) {
      this.addProjectFilters(builder, resourceType);
    }
    this.addAccessPolicyFilters(builder, resourceType, interaction);
  }

  /**
   * Returns the permitted project IDs the Repository is allowed to access for the given resource type.
   * @param resourceType - The resource type.
   * @returns The permitted project IDs or undefined if all projects are permitted
   */
  private getPermittedProjectIds(resourceType: string): string[] | undefined {
    if (!this.context.projects?.length) {
      // The repository is system-level, so all projects are permitted.
      return undefined;
    }

    const projectIds = [this.context.projects[0].id]; // Always include the first project

    if (resourceType !== 'Project' && projectAdminResourceTypes.includes(resourceType)) {
      // If the resource type is a project admin resource, only include the current project (the first project)
      return projectIds;
    }

    for (let i = 1; i < this.context.projects.length; i++) {
      const project = this.context.projects[i];
      if (
        resourceType === 'Project' || // When searching for projects, include all projects
        project.id === this.context.currentProject?.id || // Always include the current project (usually the same as the first project)
        !project.exportedResourceType?.length || // Include projects that do not specify exported resource types
        project.exportedResourceType?.includes(resourceType as ResourceType) // Include projects that export resourceType
      ) {
        projectIds.push(project.id);
      }
    }
    return projectIds;
  }

  /**
   * Adds the "project" filter to the select query.
   * @param builder - The select query builder.
   * @param resourceType - The resource type being searched.
   */
  private addProjectFilters(builder: SelectQuery, resourceType: string): void {
    const projectIds = this.getPermittedProjectIds(resourceType);
    if (projectIds) {
      builder.where('projectId', 'IN', projectIds);
    }
  }

  /**
   * Adds access policy filters to the select query.
   * @param builder - The select query builder.
   * @param resourceType - The resource type being read or searched.
   * @param interaction - The FHIR interaction being performed.
   */
  private addAccessPolicyFilters(
    builder: SelectQuery,
    resourceType: string,
    interaction: AccessPolicyInteraction
  ): void {
    const accessPolicy = this.context.accessPolicy;
    if (!accessPolicy?.resource) {
      return;
    }

    // Binary has no search parameters, so it cannot be restricted by an access policy
    if (resourceType === 'Binary') {
      return;
    }

    const expressions: Expression[] = [];

    const isProjectAdminResource = projectAdminResourceTypes.includes(resourceType);

    for (const policy of accessPolicy.resource) {
      if (
        (policy.resourceType === resourceType || (policy.resourceType === '*' && !isProjectAdminResource)) &&
        (!policy.interaction || policy.interaction.includes(interaction))
      ) {
        const policyCompartmentId = resolveId(policy.compartment);
        if (policyCompartmentId) {
          // Deprecated - to be removed
          // Add compartment restriction for the access policy.
          expressions.push(
            new Condition('compartments', 'ARRAY_OVERLAPS_AND_IS_NOT_NULL', policyCompartmentId, 'UUID[]')
          );
        } else if (policy.criteria) {
          if (!policy.criteria.startsWith(policy.resourceType + '?')) {
            getLogger().warn('Invalid access policy criteria', {
              accessPolicy: accessPolicy.id,
              resourceType: policy.resourceType,
              criteria: policy.criteria,
            });
            return; // Ignore invalid access policy criteria
          }

          // Add subquery for access policy criteria.
          let criteria = policy.criteria;
          if (policy.resourceType === '*') {
            const queryIndex = criteria.indexOf('?');
            criteria = resourceType + '?' + criteria.slice(queryIndex + 1);
          }
          const searchRequest = parseSearchRequest(criteria);
          const accessPolicyExpression = buildSearchExpression(
            this,
            builder,
            searchRequest.resourceType,
            searchRequest
          );
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
   * @param client - The database client inside the transaction.
   * @param resource - The resource.
   */
  private async writeResource(client: Pool | PoolClient, resource: Resource): Promise<void> {
    const row = buildResourceRow(resource, Repository.VERSION);
    await new InsertQuery(resource.resourceType, [row]).mergeOnConflict().execute(client);
  }

  private async batchWriteResources(resources: Resource[]): Promise<void> {
    if (!resources.length) {
      return;
    }

    const client = this.getDatabaseClient(DatabaseMode.WRITER);
    await new InsertQuery(
      resources[0].resourceType,
      resources.map((r) => buildResourceRow(r, Repository.VERSION))
    )
      .mergeOnConflict()
      .execute(client);
  }

  /**
   * Writes a version of the resource to the resource history table.
   * @param client - The database client inside the transaction.
   * @param resource - The resource.
   */
  private async writeResourceVersion(client: Pool | PoolClient, resource: Resource): Promise<void> {
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
   * @param resource - The resource.
   * @returns The list of compartments for the resource.
   */
  private getCompartments(resource: WithId<Resource>): Reference[] {
    const compartments = new Set<string>();

    if (resource.meta?.project && isUUID(resource.meta.project)) {
      // Deprecated - to be removed after migrating all tables to use "projectId" column
      compartments.add('Project/' + resource.meta.project);
    }

    if (resource.resourceType === 'User' && resource.project?.reference && isUUID(resolveId(resource.project) ?? '')) {
      // Deprecated - to be removed after migrating all tables to use "projectId" column
      compartments.add(resource.project.reference);
    }

    if (resource.meta?.accounts) {
      for (const account of resource.meta.accounts) {
        const id = resolveId(account);
        if (!account.reference?.startsWith('Project/') && id && isUUID(id)) {
          compartments.add(account.reference as string);
        }
      }
    } else if (resource.meta?.account && !resource.meta.account.reference?.startsWith('Project/')) {
      const id = resolveId(resource.meta.account);
      if (id && isUUID(id)) {
        compartments.add(resource.meta.account.reference as string);
      }
    }

    for (const patient of getPatients(resource)) {
      const patientId = resolveId(patient);
      if (patientId && isUUID(patientId)) {
        compartments.add(patient.reference);
      }
    }

    const results: Reference[] = [];
    for (const reference of compartments.values()) {
      results.push({ reference });
    }

    return results;
  }

  supportsRangeSearch(): boolean {
    return Boolean(getConfig().rangeSearch || this.context.currentProject?.features?.includes('range-search'));
  }

  /**
   * Writes resources values to the lookup tables.
   * @param client - The database client inside the transaction.
   * @param resource - The resource to index.
   * @param create - If true, then the resource is being created.
   */
  private async writeLookupTables(
    client: Pool | PoolClient,
    resource: WithId<Resource>,
    create: boolean
  ): Promise<void> {
    for (const lookupTable of lookupTables) {
      await lookupTable.indexResource(client, resource, create);
    }
  }

  private async batchWriteLookupTables<T extends Resource>(resources: WithId<T>[], create: boolean): Promise<void> {
    const client = this.getDatabaseClient(DatabaseMode.WRITER);
    for (const lookupTable of lookupTables) {
      await lookupTable.batchIndexResources(client, resources, create);
    }
  }

  /**
   * Deletes values from lookup tables.
   * @param client - The database client inside the transaction.
   * @param resource - The resource to delete.
   */
  private async deleteFromLookupTables(client: Pool | PoolClient, resource: WithId<Resource>): Promise<void> {
    for (const lookupTable of lookupTables) {
      await lookupTable.deleteValuesForResource(client, resource);
    }
  }

  /**
   * Returns the last updated timestamp for the resource.
   * During historical data migration, some client applications are allowed
   * to override the timestamp.
   * @param existing - Existing resource if one exists.
   * @param resource - The FHIR resource.
   * @returns The last updated date.
   */
  private getLastUpdated(existing: Resource | undefined, resource: Resource): string {
    if (!existing) {
      // If the resource has a specified "lastUpdated",
      // and there is no existing version,
      // and the current context is a ClientApplication (i.e., OAuth client credentials),
      // then allow the ClientApplication to set the date.
      const lastUpdated = resource.meta?.lastUpdated;
      if (lastUpdated && this.canWriteProtectedMeta()) {
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
   * @param existing - Existing resource if one exists.
   * @param updated - The FHIR resource.
   * @returns The project ID.
   */
  private getProjectId(existing: Resource | undefined, updated: Resource): string | undefined {
    if (updated.resourceType === 'Project') {
      return updated.id;
    }

    if (updated.resourceType === 'ProjectMembership') {
      return resolveId(updated.project);
    }

    if (updated.resourceType === 'User' && this.isSuperAdmin()) {
      // Super admins can add, remove, and the project compartment of users.
      return updated?.meta?.project;
    }

    if (protectedResourceTypes.includes(updated.resourceType)) {
      return undefined;
    }

    const submittedProjectId = updated.meta?.project;
    if (submittedProjectId && this.canWriteProtectedMeta()) {
      // If the resource has an project (whether provided or from existing),
      // and the current context is allowed to write meta,
      // then use the provided value.
      return submittedProjectId;
    }

    return existing?.meta?.project ?? this.context.projects?.[0]?.id;
  }

  /**
   * Returns the author reference.
   * If the current context is allowed to write meta,
   * and the provided resource includes an author reference,
   * then use the provided value.
   * Otherwise uses the current context profile.
   * @param resource - The FHIR resource.
   * @returns The author value.
   */
  getAuthor(resource?: Resource): Reference {
    // If the resource has an author (whether provided or from existing),
    // and the current context is allowed to write meta,
    // then use the provided value.
    const author = resource?.meta?.author;
    if (author && this.canWriteProtectedMeta()) {
      return author;
    }

    return this.context.author;
  }

  /**
   * Returns the author reference string (resourceType/id).
   * If the current context is a ClientApplication, handles "on behalf of".
   * Otherwise uses the current context profile.
   * @param existing - Current (soon to be previous) resource, if one exists.
   * @param updated - The incoming updated resource.
   * @returns The account values.
   */
  private async getAccounts(
    existing: WithId<Resource> | undefined,
    updated: WithId<Resource>
  ): Promise<Reference[] | undefined> {
    if (updated.meta && this.canWriteAccount()) {
      // If the user specifies accounts, and they have permission, then use the provided accounts.
      const updatedAccounts = extractAccountReferences(updated.meta);
      return updatedAccounts;
    }

    const accounts = new Set<string>();
    if (!existing && this.context.accessPolicy?.compartment?.reference) {
      // If the creator's access policy specifies a compartment, then use it as the account.
      // The writer's access policy is only applied at resource creation: simply editing a
      // resource does NOT pull it into the user's account.
      accounts.add(this.context.accessPolicy.compartment.reference);
    }

    if (updated.resourceType === 'Patient') {
      // When examining a Patient resource, we only look at the individual patient
      // We should not call `getPatients` and `readReference`
      const existingAccounts = extractAccountReferences(existing?.meta);
      for (const account of existingAccounts ?? EMPTY) {
        accounts.add(account.reference as string);
      }
    } else {
      const systemRepo = this.getSystemRepo();
      const patients = await systemRepo.readReferences(getPatients(updated));
      for (const patient of patients) {
        if (patient instanceof Error) {
          getLogger().debug('Error setting patient compartment', patient);
          continue;
        }

        // If the patient has an account, then use it as the resource account.
        const patientAccounts = extractAccountReferences(patient.meta);
        for (const account of patientAccounts ?? EMPTY) {
          if (account.reference) {
            accounts.add(account.reference);
          }
        }
      }
    }

    let result: Reference[] | undefined;
    for (const reference of accounts) {
      result = append(result, { reference });
    }
    return result;
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
   * Determines if the current user can manually set certain protected meta fields
   * such as author, project, lastUpdated, etc.
   * @returns True if the current user can manually set protected meta fields.
   */
  private canWriteProtectedMeta(): boolean {
    return this.isSuperAdmin();
  }

  private canWriteAccount(): boolean {
    return Boolean(this.context.extendedMode && (this.isSuperAdmin() || this.isProjectAdmin()));
  }

  /**
   * Verifies that the current user would be allowed to perform the given interaction,
   * without the full check on the specific resource being interacted with.
   * @param interaction - The FHIR interaction being performed.
   * @param resourceType - The type of resource the interaction is performed on.
   * @returns True when the interaction is permitted by the access policy for the given resource type.
   */
  supportsInteraction(interaction: AccessPolicyInteraction, resourceType: string): boolean {
    if (!this.isSuperAdmin() && protectedResourceTypes.includes(resourceType)) {
      return false;
    }
    if (!this.context.accessPolicy) {
      return true;
    }
    return accessPolicySupportsInteraction(this.context.accessPolicy, interaction, resourceType as ResourceType);
  }

  /**
   * Determines if the current user can actually perform some interaction on the specified resource.
   * This is a more in-depth check, e.g. after building the candidate result of a write operation.
   * @param interaction - The interaction to be performed.
   * @param resource - The resource.
   * @returns The access policy permitting the interaction, or undefined if not permitted.
   */
  canPerformInteraction(interaction: AccessPolicyInteraction, resource: Resource): AccessPolicyResource | undefined {
    if (!this.isSuperAdmin()) {
      // Only Super Admins can access server-critical resource types
      if (protectedResourceTypes.includes(resource.resourceType)) {
        return undefined;
      }
      // Non-Superusers can only access resources in their Project, with read-only access to linked Projects
      if (readInteractions.includes(interaction)) {
        const resourceProjectId = resource.meta?.project;
        if (!resourceProjectId) {
          return undefined;
        }

        const permittedProjectIds = this.getPermittedProjectIds(resource.resourceType);
        if (permittedProjectIds && !permittedProjectIds.includes(resourceProjectId)) {
          return undefined;
        }
      } else if (resource.meta?.project !== this.context.projects?.[0]?.id) {
        return undefined;
      }
    }
    return satisfiedAccessPolicy(resource, interaction, this.context.accessPolicy);
  }

  /**
   * Check that a resource can be written in its current form.
   * @param previous - The resource before updates were applied.
   * @param current - The resource as it will be written.
   * @param interaction - The FHIR interaction being performed.
   * @returns True if the current user can write the specified resource type.
   */
  private isResourceWriteable(
    previous: Resource | undefined,
    current: Resource,
    interaction: 'create' | 'update'
  ): boolean {
    const matchingPolicy = this.canPerformInteraction(interaction, current);
    if (!matchingPolicy) {
      return false;
    }
    if (!matchingPolicy.writeConstraint) {
      return true;
    }

    return matchingPolicy.writeConstraint.every((constraint) => {
      const invariant = evalFhirPathTyped(
        constraint.expression as string,
        [{ type: current.resourceType, value: current }],
        {
          '%before': { type: previous?.resourceType ?? 'undefined', value: previous },
          '%after': { type: current.resourceType, value: current },
        }
      );
      return invariant.length === 1 && invariant[0].value === true;
    });
  }

  /**
   * Returns true if the resource is "cache only" and not written to the database.
   * This is a highly specialized use case for internal system resources.
   * @param resource - The candidate resource.
   * @returns True if the resource should be cached only and not written to the database.
   */
  private isCacheOnly(resource: Resource): boolean {
    if (resource.resourceType === 'Login' && (resource.authMethod === 'client' || resource.authMethod === 'execute')) {
      return true;
    }
    if (resource.resourceType === 'Subscription' && resource.channel?.type === 'websocket') {
      return true;
    }
    return false;
  }

  /**
   * Removes hidden fields from a resource as defined by the access policy.
   * This should be called for any "read" operation.
   * @param input - The input resource.
   * @returns The resource with hidden fields removed.
   */
  removeHiddenFields<T extends Resource>(input: T): T {
    const policy = satisfiedAccessPolicy(input, AccessPolicyInteraction.READ, this.context.accessPolicy);
    for (const field of policy?.hiddenFields ?? EMPTY) {
      removeField(input, field);
    }
    if (!this.context.extendedMode && input.meta) {
      const meta = input.meta;
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
   * @param input - The input resource.
   * @param original - The previous version, if it exists.
   * @returns The resource with restored hidden fields.
   */
  private restoreReadonlyFields<T extends Resource>(input: T, original: T | undefined): T {
    const policy = satisfiedAccessPolicy(
      original ?? input,
      original ? AccessPolicyInteraction.UPDATE : AccessPolicyInteraction.CREATE,
      this.context.accessPolicy
    );
    if (!policy?.readonlyFields && !policy?.hiddenFields) {
      return input;
    }
    const fieldsToRestore = [];
    if (policy.readonlyFields) {
      fieldsToRestore.push(...policy.readonlyFields);
    }
    if (policy.hiddenFields) {
      fieldsToRestore.push(...policy.hiddenFields);
    }
    for (const field of fieldsToRestore) {
      removeField(input, field);
      // only top-level fields can be restored.
      // choice-of-type fields technically aren't allowed in readonlyFields/hiddenFields,
      // but that isn't currently enforced at write time, so exclude them here
      if (original && !field.includes('.') && !field.endsWith('[x]')) {
        const value = original[field as keyof T];
        if (value) {
          input[field as keyof T] = value;
        }
      }
    }
    return input;
  }

  isSuperAdmin(): boolean {
    return !!this.context.superAdmin;
  }

  isProjectAdmin(): boolean {
    return !!this.context.projectAdmin;
  }

  /**
   * Logs an AuditEvent for a restful operation.
   * @param subtype - The AuditEvent subtype.
   * @param outcome - The AuditEvent outcome.
   * @param description - The description.  Can be a string, object, or Error.  Will be normalized to a string.
   * @param options -
   * @param options.resource - Optional resource to associate with the AuditEvent.
   * @param options.searchRequest - Optional search parameters to associate with the AuditEvent.
   * @param options.durationMs - Duration of the operation, used for generating metrics.
   */
  private logEvent(
    subtype: AuditEventSubtype,
    outcome: AuditEventOutcome,
    description?: unknown,
    options?: {
      resource?: Resource | Reference;
      searchRequest?: SearchRequest;
      durationMs?: number;
    }
  ): void {
    const resource = options?.resource;
    const isSystem = this.context.author.reference === 'system';

    if (options?.durationMs !== undefined && outcome === AuditEventOutcome.Success) {
      const duration = options.durationMs / 1000; // Report duration in whole seconds
      recordHistogramValue('medplum.fhir.interaction.' + subtype.code, duration, {
        attributes: {
          system: isSystem,
          resourceType: isResource(resource) ? resource?.resourceType : undefined,
        },
      });
    }
    incrementCounter(`medplum.fhir.interaction.${subtype.code}.count`, {
      attributes: {
        system: isSystem,
        resourceType: isResource(resource) ? resource?.resourceType : undefined,
        result: outcome === AuditEventOutcome.Success ? 'success' : 'failure',
      },
    });

    if (isSystem) {
      // Don't log system events.
      return;
    }
    let outcomeDesc: string | undefined = undefined;
    if (description) {
      outcomeDesc = normalizeErrorString(description);
    }
    let query: string | undefined = undefined;
    if (options?.searchRequest) {
      query = options.searchRequest.resourceType + formatSearchQuery(options.searchRequest);
    }

    const auditEvent = createAuditEvent(
      RestfulOperationType,
      subtype,
      this.context.projects?.[0]?.id as string,
      this.context.author,
      this.context.remoteAddress,
      outcome,
      {
        description: outcomeDesc,
        resource,
        searchQuery: query,
        durationMs: options?.durationMs,
      }
    );
    logAuditEvent(auditEvent);

    if (getConfig().saveAuditEvents && isResource(resource) && resource?.resourceType !== 'AuditEvent') {
      auditEvent.id = this.generateId();
      this.updateResourceImpl(auditEvent, true).catch((err) => getLogger().error('Failed to save AuditEvent', err));
    }
  }

  /**
   * Returns a database client.
   * Use this method when you don't care if you're in a transaction or not.
   * For example, use this method for "read by ID".
   * The return value can either be a pool client or a pool.
   * If in a transaction, then returns the transaction client (PoolClient).
   * Otherwise, returns the pool (Pool).
   * @param mode - The database mode.
   * @returns The database client.
   */
  getDatabaseClient(mode: DatabaseMode): Pool | PoolClient {
    this.assertUsable();
    return this.connection.getDatabaseClient(mode);
  }

  override async withTransaction<TResult>(
    callback: (repo: this) => Promise<TResult>,
    options?: { serializable?: boolean }
  ): Promise<TResult> {
    this.assertUsable();
    const transactionRepo = this.createTransactionScopedRepo();
    this.transactionChildRepo = transactionRepo;
    try {
      return await this.connection.withTransaction(() => callback(transactionRepo), options);
    } finally {
      this.transactionChildRepo = undefined;
    }
  }

  async withStatementTimeout<TResult>(
    options: StatementTimeoutOptions,
    callback: (client: PoolClient) => Promise<TResult>
  ): Promise<TResult> {
    this.assertUsable();
    if (!this.ownsConnection) {
      throw new Error('Cannot set statement timeout on a borrowed repository connection');
    }
    return this.connection.withStatementTimeout(options, callback);
  }

  async preCommit(fn: (repo: this) => void | Promise<void>): Promise<void> {
    this.assertUsable();
    return this.connection.preCommit(async () => fn(this));
  }

  async postCommit(fn: (repo: this) => void | Promise<void>): Promise<void> {
    this.assertUsable();
    return this.connection.postCommit(async () => fn(this));
  }

  /**
   * Tries to read a cache entry from Redis by resource type and ID.
   * @param resourceType - The resource type.
   * @param id - The resource ID.
   * @returns The cache entry if found; otherwise, undefined.
   */
  private async getCacheEntry<T extends Resource>(
    resourceType: string,
    id: string
  ): Promise<CacheEntry<WithId<T>> | undefined> {
    // No cache access allowed mid-transaction
    if (this.connection.isInTransaction()) {
      return undefined;
    }
    return getResourceCacheEntry<T>(resourceType, id);
  }

  /**
   * Performs a bulk read of cache entries from Redis.
   * @param references - Array of FHIR references.
   * @returns Array of cache entries or undefined.
   */
  private async getCacheEntries(references: Reference[]): Promise<(CacheEntry | undefined)[]> {
    // No cache access allowed mid-transaction
    if (this.connection.isInTransaction()) {
      return new Array(references.length);
    }

    return getResourceCacheEntries(references);
  }

  /**
   * Writes a cache entry to Redis.
   * @param resource - The resource to cache.
   */
  private async setCacheEntry(resource: WithId<Resource>): Promise<void> {
    // No cache access allowed mid-transaction
    if (this.connection.isInTransaction()) {
      const cachedResource = deepClone(resource);
      await this.postCommit(() => {
        return this.setCacheEntry(cachedResource);
      });
      return;
    }

    await setResourceCacheEntry(resource);
  }

  /**
   * Deletes a cache entry from Redis.
   * @param resourceType - The resource type.
   * @param id - The resource ID.
   */
  private async deleteCacheEntry(resourceType: string, id: string): Promise<void> {
    // No cache access allowed mid-transaction
    if (this.connection.isInTransaction()) {
      await this.postCommit(() => this.deleteCacheEntry(resourceType, id));
      return;
    }

    await deleteResourceCacheEntry(resourceType, id);
  }

  /**
   * Deletes cache entries from Redis.
   * @param resourceType - The resource type.
   * @param ids - The resource IDs.
   */
  private async deleteCacheEntries(resourceType: string, ids: string[]): Promise<void> {
    // No cache access allowed mid-transaction
    if (this.connection.isInTransaction()) {
      await this.postCommit(() => this.deleteCacheEntries(resourceType, ids));
      return;
    }

    await deleteResourceCacheEntries(resourceType, ids);
  }

  async ensureInTransaction<TResult>(callback: (repo: this) => Promise<TResult>): Promise<TResult> {
    this.assertUsable();
    if (this.connection.isInTransaction()) {
      return callback(this);
    }

    return this.withTransaction(callback);
  }

  getConfig(): RepositoryContext {
    return this.context;
  }

  [Symbol.dispose](removeConnection?: boolean): void {
    this.assertUsable();
    if (this.ownsConnection) {
      this.connection[Symbol.dispose](removeConnection);
    }
    this.closed = true;
  }

  private assertUsable(): void {
    if (this.closed) {
      throw new Error('Already closed');
    }
    if (this.transactionChildRepo) {
      throw new Error(
        'Repository is in an active transaction callback; use the transaction-scoped repository passed to the callback'
      );
    }
  }
}

export class SystemRepository extends Repository {}

type SystemRepositoryContextDefaults = Pick<RepositoryContext, 'skipBackgroundJobs'>;

/**
 * Creates a SystemRepository for the specified shard.
 * @param shardId - The shard ID.
 * @param connection - Optional repository connection for transaction support.
 * @param contextDefaults - Optional context defaults to apply before the fixed SystemRepository context.
 * @returns A SystemRepository instance.
 */
function createSystemRepository(
  shardId: string,
  connection?: RepositoryConnection,
  contextDefaults?: SystemRepositoryContextDefaults
): SystemRepository {
  return new SystemRepository(
    {
      ...contextDefaults,
      shardId,
      superAdmin: true,
      strictMode: true,
      extendedMode: true,
      author: {
        reference: 'system',
      },
      // System repo does not have an associated Project; it can write to any
    },
    connection
  );
}

/*
SystemRepository getters in order of preference:

1. repo.getSystemRepo() - If a non-system repo is already available, elevate it to a SystemRepository
2. AuthenticatedRequestContext.systemRepo() - If in an authenticated request handler, a shortcut for ctx.repo.getSystemRepo()
3. getProjectSystemRepo(projectOrIdOrReference) - If a project, project ID, or Project reference is available. This should
    typically be used in pre-authed code before an AuthenticatedRequestContext has been established.
4. getGlobalSystemRepo() - If none of the above are applicable, the global system last resort. There should
    be a very good reason for using it; often also in pre-auth code. Supply a comment explaining why its being used.

You'll also notice getShardSystemRepo(), but there's very little reason this one should be needed right now. It's
mostly intended for system-level, super-admin triggered operations against a particular DB.
*/

/**
 * Returns a SystemRepository for the global shard.
 *
 * Use this for operations that don't have project context:
 * - Authentication (before project is known)
 * - Looking up Users, Logins, ClientApplications
 * - Cross-project operations by super admins
 *
 * @param connection - Optional repository connection to use in new Repository.
 * @param contextDefaults - Optional context defaults to apply before the fixed SystemRepository context.
 * @returns A SystemRepository for the global shard.
 */
export function getGlobalSystemRepo(
  connection?: RepositoryConnection,
  contextDefaults?: SystemRepositoryContextDefaults
): SystemRepository {
  return createSystemRepository(GLOBAL_SHARD_ID, connection, contextDefaults);
}

/**
 * This is a sharding future-proofing function that returns a SystemRepository for the specified shard.
 * Prefer using `Repository.getSystemRepo` or `getProjectSystemRepo` if working in the context of a project
 * or `getGlobalSystemRepo` if intentionally working in the global shard.
 * @param shardId - The shard ID. Currently ignored.
 * @param connection - Optional repository connection to use in new Repository.
 * @param contextDefaults - Optional context defaults to apply before the fixed SystemRepository context.
 * @returns A SystemRepository for the specified shard.
 */
export function getShardSystemRepo(
  shardId: string,
  connection?: RepositoryConnection,
  contextDefaults?: SystemRepositoryContextDefaults
): SystemRepository {
  return createSystemRepository(shardId, connection, contextDefaults);
}

/**
 * Returns a SystemRepository for the specified project's shard.
 *
 * Note: This is a passthrough to `getGlobalSystemRepo` to facilitate
 * future sharding support.
 *
 * @param _projectId - The project's ID, reference, or resource.
 * @returns A SystemRepository for the project's shard.
 */
export async function getProjectSystemRepo(
  _projectId: string | Reference<Project> | WithId<Project>
): Promise<SystemRepository> {
  // Eventually, this will resolve the project's shard and return
  // a SystemRepository for that shard.
  // But for now, all projects are on the global shard.
  return getGlobalSystemRepo();
}
