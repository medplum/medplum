// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AccessPolicyInteraction,
  accessPolicySupportsInteraction,
  allOk,
  arrayify,
  BackgroundJobInteraction,
  badRequest,
  convertToSearchableDates,
  convertToSearchableNumbers,
  convertToSearchableQuantities,
  convertToSearchableReferences,
  convertToSearchableStrings,
  convertToSearchableTokens,
  convertToSearchableUris,
  createReference,
  deepClone,
  deepEquals,
  DEFAULT_MAX_SEARCH_COUNT,
  evalFhirPathTyped,
  Filter,
  flatMapFilter,
  forbidden,
  formatSearchQuery,
  getReferenceString,
  getStatus,
  gone,
  isGone,
  isNotFound,
  isObject,
  isOk,
  isResource,
  isResourceWithId,
  isUUID,
  normalizeErrorString,
  normalizeOperationOutcome,
  notFound,
  OperationOutcomeError,
  Operator,
  parseReference,
  parseSearchRequest,
  preconditionFailed,
  PropertyType,
  protectedResourceTypes,
  readInteractions,
  resolveId,
  satisfiedAccessPolicy,
  SearchParameterDetails,
  SearchParameterType,
  SearchRequest,
  serverError,
  sleep,
  stringify,
  toPeriod,
  toTypedValue,
  TypedValue,
  validateResource,
  validateResourceType,
  WithId,
} from '@medplum/core';
import { CreateResourceOptions, FhirRepository, RepositoryMode, UpdateResourceOptions } from '@medplum/fhir-router';
import {
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
  SearchParameter,
  StructureDefinition,
} from '@medplum/fhirtypes';
import { Readable } from 'node:stream';
import { Pool, PoolClient } from 'pg';
import { Operation } from 'rfc6902';
import { v4 } from 'uuid';
import { getConfig } from '../config/loader';
import { syntheticR4Project } from '../constants';
import { tryGetRequestContext } from '../context';
import { DatabaseMode, getDatabasePool } from '../database';
import { FhirRateLimiter } from '../fhirquota';
import { getLogger } from '../logger';
import { incrementCounter, recordHistogramValue } from '../otel/otel';
import { getRedis } from '../redis';
import { getBinaryStorage } from '../storage/loader';
import {
  AuditEventOutcome,
  AuditEventSubtype,
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
import { validateResourceWithJsonSchema } from './jsonschema';
import { getStandardAndDerivedSearchParameters } from './lookups/util';
import { getPatients } from './patient';
import { preCommitValidation } from './precommit';
import { replaceConditionalReferences, validateResourceReferences } from './references';
import { getFullUrl } from './response';
import { rewriteAttachments, RewriteMode } from './rewrite';
import { buildSearchExpression, searchByReferenceImpl, searchImpl, SearchOptions } from './search';
import { ColumnSearchParameterImplementation, getSearchParameterImplementation, lookupTables } from './searchparameter';
import {
  Condition,
  DeleteQuery,
  Disjunction,
  Expression,
  InsertQuery,
  normalizeDatabaseError,
  periodToRangeString,
  PostgresError,
  SelectQuery,
  TransactionIsolationLevel,
} from './sql';
import { buildTokenColumns } from './token-column';

const defaultTransactionAttempts = 2;
const defaultExpBackoffBaseDelayMs = 50;
const retryableTransactionErrorCodes: string[] = [PostgresError.SerializationFailure];

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

  /**
   * Optional flag to include Medplum extended meta fields.
   * Medplum tracks additional metadata for each resource, such as:
   * 1) "author" - Reference to the last user who modified the resource.
   * 2) "project" - Reference to the project that owns the resource.
   * 3) "compartment" - References to all compartments the resource is in.
   */
  extendedMode?: boolean;
}

export interface CacheEntry<T extends Resource = Resource> {
  resource: T;
  projectId: string;
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

/**
 * The Repository class manages reading and writing to the FHIR repository.
 * It is a thin layer on top of the database.
 * Repository instances should be created per author and project.
 */
export class Repository extends FhirRepository<PoolClient> implements Disposable {
  private readonly context: RepositoryContext;
  private conn?: PoolClient;
  private readonly disposable: boolean = true;
  private transactionDepth = 0;
  private closed = false;
  mode: RepositoryMode;

  private preCommitCallbacks: (() => Promise<void>)[] = [];
  private postCommitCallbacks: (() => Promise<void>)[] = [];

  /**
   * The version to be set on resources when they are inserted/updated into the database.
   * The value should be incremented each time there is a change in the schema (really just columns)
   * of the resource tables or when there are code changes to `buildResourceRow`.
   *
   * Version history:
   *
   * 1. 02/27/25 - Added `__version` column (https://github.com/medplum/medplum/pull/6033)
   * 2. 04/09/25 - Added qualification-code search param for `Practitioner` (https://github.com/medplum/medplum/pull/6280)
   * 3. 04/09/25 - Added __tokens column for `token-column` search strategy (https://github.com/medplum/medplum/pull/6291)
   * 4. 04/25/25 - Consider `resource.id` in lookup table batch reindex (https://github.com/medplum/medplum/pull/6479)
   * 5. 04/29/25 - Added `status` param for `Flag` resources (https://github.com/medplum/medplum/pull/6500)
   * 6. 06/12/25 - Added columns per token search parameter (https://github.com/medplum/medplum/pull/6727)
   * 7. 06/25/25 - Added search params `ProjectMembership-identifier`, `Immunization-encounter`, `AllergyIntolerance-encounter` (https://github.com/medplum/medplum/pull/6868)
   * 8. 08/06/25 - Added Task to Patient compartment (https://github.com/medplum/medplum/pull/7194)
   *
   */
  static readonly VERSION: number = 8;

  constructor(context: RepositoryContext, conn?: PoolClient) {
    super();
    this.context = context;
    this.context.projects?.push(syntheticR4Project);
    if (!this.context.author?.reference) {
      throw new Error('Invalid author reference');
    }

    if (conn) {
      this.conn = conn;
      this.disposable = false;
    }

    // Default to writer mode
    // In the future, as we do more testing and validation, we will explore defaulting to reader mode
    // However, for now, we default to writer and only use reader mode for requests guaranteed not to have consistency risks
    this.mode = RepositoryMode.WRITER;
  }

  clone(): Repository {
    return new Repository(this.context, this.conn);
  }

  setMode(mode: RepositoryMode): void {
    this.mode = mode;
  }

  rateLimiter(): FhirRateLimiter | undefined {
    if (this.isSuperAdmin()) {
      return undefined;
    }
    return tryGetRequestContext()?.fhirRateLimiter;
  }

  currentProject(): WithId<Project> | undefined {
    return this.context.currentProject;
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
    return getSystemRepo().readResource<Project>('Project', projectId);
  }

  async createResource<T extends Resource>(resource: T, options?: CreateResourceOptions): Promise<WithId<T>> {
    await this.rateLimiter()?.recordWrite();

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
    return v4();
  }

  async readResource<T extends Resource>(
    resourceType: T['resourceType'],
    id: string,
    options?: ReadResourceOptions
  ): Promise<WithId<T>> {
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

    this.addSecurityFilters(builder, resourceType);

    const rows = await builder.execute(this.getDatabaseClient(DatabaseMode.READER));
    if (rows.length === 0) {
      throw new OperationOutcomeError(notFound);
    }

    if (rows[0].deleted) {
      throw new OperationOutcomeError(gone);
    }

    const resource = JSON.parse(rows[0].content as string) as WithId<T>;
    await this.setCacheEntry(resource);
    return resource;
  }

  async readReferences<T extends Resource>(references: Reference<T>[]): Promise<(WithId<T> | Error)[]> {
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
      throw new OperationOutcomeError(normalizeOperationOutcome(err), err);
    }
  }

  async readReference<T extends Resource>(reference: Reference<T>): Promise<WithId<T>> {
    let parts: [T['resourceType'], string];
    try {
      parts = parseReference(reference);
    } catch (_err) {
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
   * @param limit - The maximum number of results to return.
   * @returns Operation outcome and a history bundle.
   */
  async readHistory<T extends Resource>(resourceType: T['resourceType'], id: string, limit = 100): Promise<Bundle<T>> {
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

      const rows = await new SelectQuery(resourceType + '_History')
        .column('versionId')
        .column('id')
        .column('content')
        .column('lastUpdated')
        .where('id', '=', id)
        .orderBy('lastUpdated', true)
        .limit(Math.min(limit, DEFAULT_MAX_SEARCH_COUNT))
        .execute(this.getDatabaseClient(DatabaseMode.READER));

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

  async readVersion<T extends Resource>(resourceType: T['resourceType'], id: string, vid: string): Promise<T> {
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

  async updateResource<T extends Resource>(resource: T, options?: UpdateResourceOptions): Promise<WithId<T>> {
    await this.rateLimiter()?.recordWrite();

    const startTime = Date.now();
    try {
      let result: WithId<T>;
      if (options?.ifMatch) {
        // Conditional update requires transaction
        result = await this.withTransaction(() => this.updateResourceImpl(resource, false, options));
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
    if (!resource.meta?.profile && this.currentProject()?.defaultProfile) {
      const defaultProfiles = this.currentProject()?.defaultProfile?.find(
        (o) => o.resourceType === resourceType
      )?.profile;
      resource.meta = { ...resource.meta, profile: defaultProfiles };
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

    const preCommitResult = await preCommitValidation(
      this.context.author,
      this.context.projects?.[0],
      validatedResource,
      'update'
    );

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
    const accounts = await this.getAccounts(existing, updated, options?.inheritAccounts);
    if (accounts) {
      resultMeta.account = accounts[0];
      resultMeta.accounts = accounts;
    }
    resultMeta.compartment = this.getCompartments(result);

    // Validate resource after all modifications and touchups above are done
    await this.validateResource(result);
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
    await this.postCommit(async () => {
      const project = await this.getProjectById(projectId);
      await addBackgroundJobs(result, existing, { project, interaction });
    });

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
    await this.setCacheEntry(resource);

    // Handle special cases for resource caching
    if (resource.resourceType === 'Subscription' && resource.channel?.type === 'websocket') {
      const redis = getRedis();
      const project = resource?.meta?.project;
      if (!project) {
        throw new OperationOutcomeError(serverError(new Error('No project connected to the specified Subscription.')));
      }
      // WebSocket Subscriptions are also cache-only, but also need to be added to a special cache key
      await redis.sadd(`medplum:subscriptions:r4:project:${project}:active`, `Subscription/${resource.id}`);
    }
    if (resource.resourceType === 'StructureDefinition') {
      await removeCachedProfile(resource);
    }
  }

  /**
   * Validates a resource against the current project configuration.
   * If strict mode is enabled (default), validates against base StructureDefinition and all profiles.
   * If strict mode is disabled, validates against the legacy JSONSchema validator.
   * Throws on validation errors.
   * Returns silently on success.
   * @param resource - The candidate resource to validate.
   */
  async validateResource(resource: Resource): Promise<void> {
    if (this.context.strictMode) {
      await this.validateResourceStrictly(resource);
    } else {
      // Perform loose validation first to detect any severe issues
      validateResourceWithJsonSchema(resource);

      // Attempt strict validation and log warnings on failure
      try {
        await this.validateResourceStrictly(resource);
      } catch (err: any) {
        getLogger().warn('Strict validation would fail', {
          resource: getReferenceString(resource),
          err,
        });
      }
    }
  }

  async validateResourceStrictly(resource: Resource): Promise<void> {
    const logger = getLogger();
    const start = process.hrtime.bigint();

    const issues = validateResource(resource);
    for (const issue of issues) {
      logger.warn(`Validator warning: ${issue.details?.text}`, { project: this.context.projects?.[0]?.id, issue });
    }

    const profileUrls = resource.meta?.profile;
    if (profileUrls) {
      await this.validateProfiles(resource, profileUrls);
    }

    const durationMs = Number(process.hrtime.bigint() - start) / 1e6; // Convert nanoseconds to milliseconds
    recordHistogramValue('medplum.server.validationDurationMs', durationMs, { options: { unit: 'ms' } });
    if (durationMs > 10) {
      logger.debug('High validator latency', {
        resourceType: resource.resourceType,
        id: resource.id,
        durationMs,
      });
    }
  }

  private async validateProfiles(resource: Resource, profileUrls: string[]): Promise<void> {
    const logger = getLogger();
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
      validateResource(resource, { profile });
      const validateTime = Number(process.hrtime.bigint() - validateStart);
      logger.debug('Profile loaded', {
        url,
        loadTime,
        validateTime,
      });
    }
  }

  private async loadProfile(url: string): Promise<StructureDefinition | undefined> {
    if (this.context.projects?.length) {
      // Try loading from cache, using all available Project IDs
      const cacheKeys = this.context.projects.map((p) => getProfileCacheKey(p.id, url));
      const results = await getRedis().mget(...cacheKeys);
      const cachedProfile = results.find(Boolean) as string | undefined;
      if (cachedProfile) {
        return (JSON.parse(cachedProfile) as CacheEntry<StructureDefinition>).resource;
      }
    }

    // Fall back to loading from the DB; descending version sort approximates version resolution for some cases
    const profile = await this.searchOne<StructureDefinition>({
      resourceType: 'StructureDefinition',
      filters: [
        {
          code: 'url',
          operator: Operator.EQUALS,
          value: url,
        },
      ],
      sortRules: [
        {
          code: 'version',
          descending: true,
        },
        {
          code: 'date',
          descending: true,
        },
      ],
    });

    if (this.context.projects?.length && profile) {
      // Store loaded profile in cache
      await cacheProfile(profile);
    }
    return profile;
  }

  /**
   * Writes the resource to the database.
   * This is a single atomic operation inside of a transaction.
   * @param resource - The resource to write to the database.
   * @param create - If true, then the resource is being created.
   */
  private async writeToDatabase<T extends WithId<Resource>>(resource: T, create: boolean): Promise<void> {
    await this.ensureInTransaction(async (client) => {
      await this.writeResource(client, resource);
      await this.writeResourceVersion(client, resource);
      await this.writeLookupTables(client, resource, create);
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
        throw new OperationOutcomeError(outcome, err);
      }

      if (isNotFound(outcome) && !this.canSetId()) {
        throw new OperationOutcomeError(outcome, err);
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
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    await this.withTransaction(async (conn) => {
      const resource = await this.readResourceImpl<T>(resourceType, id);
      return this.reindexResources(conn, [resource]);
    });
  }

  /**
   * Internal implementation of reindexing a resource.
   * This accepts a resource as a parameter, rather than a resource type and ID.
   * When doing a bulk reindex, this will be more efficient because it avoids unnecessary reads.
   * @param conn - Database client to use for reindex operations.
   * @param resources - The resource(s) to reindex.
   */
  async reindexResources<T extends Resource>(conn: PoolClient, resources: WithId<T>[]): Promise<void> {
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

    await this.batchWriteLookupTables(conn, resources, false);
    await this.batchWriteResources(conn, resources);
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
    if (!this.isSuperAdmin() && !this.isProjectAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    const resource = await this.readResourceImpl<T>(resourceType, id);
    const interaction = options?.interaction ?? 'update';
    let previousVersion: T | undefined;

    if (interaction === 'update') {
      const history = await this.readHistory(resourceType, id, 2);
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

  async deleteResource<T extends Resource = Resource>(resourceType: T['resourceType'], id: string): Promise<void> {
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

      await preCommitValidation(this.context.author, this.context.projects?.[0], resource, 'delete');

      await this.deleteCacheEntry(resourceType, id);

      await this.ensureInTransaction(async (conn) => {
        const lastUpdated = new Date();
        const content = '';
        const columns: Record<string, any> = {
          id,
          lastUpdated,
          deleted: true,
          projectId: resource.meta?.project,
          content,
        };

        if (resourceType !== 'Binary') {
          columns['compartments'] = this.getCompartments(resource).map((ref) => resolveId(ref));
        }

        for (const searchParam of getStandardAndDerivedSearchParameters(resourceType)) {
          this.buildColumn({ resourceType } as Resource, columns, searchParam);
        }

        await new InsertQuery(resourceType, [columns]).mergeOnConflict().execute(conn);

        await new InsertQuery(resourceType + '_History', [
          {
            id,
            versionId: this.generateId(),
            lastUpdated,
            content,
          },
        ]).execute(conn);

        await this.deleteFromLookupTables(conn, resource);
        const durationMs = Date.now() - startTime;

        await this.postCommit(async () => {
          this.logEvent(DeleteInteraction, AuditEventOutcome.Success, undefined, { resource, durationMs });
        });
      });

      await addSubscriptionJobs(resource, resource, {
        project: await this.getProjectById(resource.meta?.project),
        interaction: 'delete',
      });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(DeleteInteraction, AuditEventOutcome.MinorFailure, err, {
        resource: { reference: `${resourceType}/${id}` },
        durationMs,
      });
      throw err;
    }
  }

  async patchResource<T extends Resource>(
    resourceType: T['resourceType'],
    id: string,
    patch: Operation[],
    options?: UpdateResourceOptions
  ): Promise<WithId<T>> {
    await this.rateLimiter()?.recordWrite();

    const startTime = Date.now();
    try {
      return await this.ensureInTransaction(async () => {
        const resource = await this.readResourceFromDatabase<T>(resourceType, id);

        if (resource.resourceType !== resourceType) {
          throw new OperationOutcomeError(badRequest('Incorrect resource type'));
        }
        if (resource.id !== id) {
          throw new OperationOutcomeError(badRequest('Incorrect ID'));
        }

        patchObject(resource, patch);

        const result = await this.updateResourceImpl(resource, false, options);
        const durationMs = Date.now() - startTime;

        await this.postCommit(async () => {
          this.logEvent(PatchInteraction, AuditEventOutcome.Success, undefined, { resource: result, durationMs });
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
    await this.expungeResources(resourceType, [id]);
  }

  /**
   * Permanently deletes the specified resources and all of its history.
   * This is only available to the system and super admin accounts.
   * @param resourceType - The FHIR resource type.
   * @param ids - The resource IDs.
   */
  async expungeResources(resourceType: string, ids: string[]): Promise<void> {
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }
    if (ids.length === 0) {
      return;
    }
    await this.withTransaction(async (client) => {
      for (const id of ids) {
        await this.deleteFromLookupTables(client, { resourceType, id } as Resource);
      }

      const db = this.getDatabaseClient(DatabaseMode.WRITER);
      await new DeleteQuery(resourceType).where('id', 'IN', ids).execute(db);
      await new DeleteQuery(resourceType + '_History').where('id', 'IN', ids).execute(db);
      await this.postCommit(() => this.deleteCacheEntries(resourceType, ids));
    });
    incrementCounter(
      `medplum.fhir.interaction.delete.count`,
      { attributes: { resourceType, result: 'success' } },
      ids.length
    );
  }

  /**
   * Purges resources of the specified type that were last updated before the specified date.
   * This is only available to the system and super admin accounts.
   * @param resourceType - The FHIR resource type.
   * @param before - The date before which resources should be purged.
   */
  async purgeResources(resourceType: ResourceType, before: string): Promise<void> {
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

  async search<T extends Resource>(
    searchRequest: SearchRequest<T>,
    options?: SearchOptions
  ): Promise<Bundle<WithId<T>>> {
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

  async searchByReference<T extends Resource>(
    searchRequest: SearchRequest<T>,
    referenceField: string,
    references: string[]
  ): Promise<Record<string, WithId<T>[]>> {
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
   */
  addSecurityFilters(builder: SelectQuery, resourceType: string): void {
    // No compartment restrictions for admins.
    if (!this.isSuperAdmin()) {
      this.addProjectFilters(builder, resourceType);
    }
    this.addAccessPolicyFilters(builder, resourceType);
  }

  /**
   * Adds the "project" filter to the select query.
   * @param builder - The select query builder.
   * @param resourceType - The resource type being searched.
   */
  private addProjectFilters(builder: SelectQuery, resourceType: string): void {
    if (this.context.projects?.length) {
      const projectIds = [this.context.projects[0].id]; // Always include the first project
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
      builder.where('projectId', 'IN', projectIds);
    }
  }

  /**
   * Adds access policy filters to the select query.
   * @param builder - The select query builder.
   * @param resourceType - The resource type being searched.
   */
  private addAccessPolicyFilters(builder: SelectQuery, resourceType: string): void {
    const accessPolicy = this.context.accessPolicy;
    if (!accessPolicy?.resource) {
      return;
    }

    // Binary has no search parameters, so it cannot be restricted by an access policy
    if (resourceType === 'Binary') {
      return;
    }

    const expressions: Expression[] = [];

    for (const policy of accessPolicy.resource) {
      if (policy.resourceType === resourceType || policy.resourceType === '*') {
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

  private buildResourceRow(resource: Resource): Record<string, any> {
    const resourceType = resource.resourceType;
    const meta = resource.meta as Meta;
    const content = stringify(resource);

    const row: Record<string, any> = {
      id: resource.id,
      lastUpdated: meta.lastUpdated,
      deleted: false,
      projectId: meta.project,
      content,
      __version: Repository.VERSION,
    };

    const searchParams = getStandardAndDerivedSearchParameters(resourceType);
    if (searchParams.length > 0) {
      const startTime = process.hrtime.bigint();
      try {
        for (const searchParam of searchParams) {
          this.buildColumn(resource, row, searchParam);
        }
      } catch (err) {
        getLogger().error('Error building row for resource', {
          resource: `${resourceType}/${resource.id}`,
          err,
        });
        throw err;
      }
      recordHistogramValue(
        'medplum.server.indexingDurationMs',
        Number(process.hrtime.bigint() - startTime) / 1e6, // High resolution time, converted from ns to ms
        {
          options: { unit: 'ms' },
        }
      );
    }

    return row;
  }

  /**
   * Writes the resource to the resource table.
   * This builds all search parameter columns.
   * This does *not* write the version to the history table.
   * @param client - The database client inside the transaction.
   * @param resource - The resource.
   */
  private async writeResource(client: PoolClient, resource: Resource): Promise<void> {
    await new InsertQuery(resource.resourceType, [this.buildResourceRow(resource)]).mergeOnConflict().execute(client);
  }

  private async batchWriteResources(client: PoolClient, resources: Resource[]): Promise<void> {
    if (!resources.length) {
      return;
    }

    await new InsertQuery(
      resources[0].resourceType,
      resources.map((r) => this.buildResourceRow(r))
    )
      .mergeOnConflict()
      .execute(client);
  }

  /**
   * Writes a version of the resource to the resource history table.
   * @param client - The database client inside the transaction.
   * @param resource - The resource.
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

  /**
   * Builds the columns to write for a given resource and search parameter.
   * If nothing to write, then no columns will be added.
   * Some search parameters can result in multiple columns (for example, Reference objects).
   * @param resource - The resource to write.
   * @param columns - The output columns to write.
   * @param searchParam - The search parameter definition.
   */
  private buildColumn(resource: Resource, columns: Record<string, any>, searchParam: SearchParameter): void {
    if (
      searchParam.code === '_id' ||
      searchParam.code === '_lastUpdated' ||
      searchParam.code === '_compartment:identifier' ||
      searchParam.code === '_deleted' ||
      searchParam.type === 'composite'
    ) {
      return;
    }

    if (searchParam.code === '_compartment') {
      columns['compartments'] = resource.meta?.compartment?.map((ref) => resolveId(ref)) ?? [];
      return;
    }

    const impl = getSearchParameterImplementation(resource.resourceType, searchParam);
    if (impl.searchStrategy === 'lookup-table') {
      return;
    }

    const typedValues = evalFhirPathTyped(impl.parsedExpression, [toTypedValue(resource)]);

    let columnImpl: ColumnSearchParameterImplementation | undefined;
    if (impl.searchStrategy === 'token-column') {
      buildTokenColumns(searchParam, impl, columns, resource);
    } else {
      impl satisfies ColumnSearchParameterImplementation;
      columnImpl = impl;
    }

    if (columnImpl) {
      const columnValues = this.buildColumnValues(searchParam, columnImpl, typedValues);
      if (columnImpl.array) {
        columns[columnImpl.columnName] = columnValues.length > 0 ? columnValues : undefined;
      } else {
        columns[columnImpl.columnName] = columnValues[0];
      }
    }

    // Handle special case for "MeasureReport-period"
    // This is a trial for using "tstzrange" columns for date/time ranges.
    // Eventually, this special case will go away, and this will become the default behavior for all "date" search parameters.
    if (searchParam.id === 'MeasureReport-period') {
      columns['period_range'] = this.buildPeriodColumn(typedValues[0]?.value);
    }
  }

  /**
   * Builds a single value for a given search parameter.
   * If the search parameter is an array, then this method will be called for each element.
   * If the search parameter is not an array, then this method will be called for the value.
   * @param searchParam - The search parameter definition.
   * @param details - The extra search parameter details.
   * @param typedValues - The FHIR resource value.
   * @returns The column value.
   */
  private buildColumnValues(
    searchParam: SearchParameter,
    details: SearchParameterDetails,
    typedValues: TypedValue[]
  ): (boolean | number | string | undefined)[] {
    if (details.type === SearchParameterType.BOOLEAN) {
      const value = typedValues[0]?.value;
      return [value === true || value === 'true'];
    }

    if (details.type === SearchParameterType.DATE) {
      // "Date" column is a special case that only applies when the following conditions are true:
      // 1. The search parameter is a date type.
      // 2. The underlying FHIR ElementDefinition referred to by the search parameter has a type of "date".
      return flatMapFilter(convertToSearchableDates(typedValues), (p) => (p.start ?? p.end)?.substring(0, 10));
    }

    if (details.type === SearchParameterType.DATETIME) {
      // Future work: write the whole period to the DB after migrating all "date" search parameters to use a tstzrange.
      return flatMapFilter(convertToSearchableDates(typedValues), (p) => p.start ?? p.end);
    }

    if (searchParam.type === 'number') {
      // Future work: write the whole range to the DB after migrating all "number" search parameters to use a range.
      return flatMapFilter(convertToSearchableNumbers(typedValues), ([low, high]) => low ?? high);
    }

    if (searchParam.type === 'quantity') {
      // Future work: write the whole range to the DB after migrating all "quantity" search parameters to use a range.
      return flatMapFilter(convertToSearchableQuantities(typedValues), (q) => q.value);
    }

    if (searchParam.type === 'reference') {
      return flatMapFilter(convertToSearchableReferences(typedValues), truncateTextColumn);
    }

    if (searchParam.type === 'token') {
      return flatMapFilter(convertToSearchableTokens(typedValues), (t) => truncateTextColumn(t.value));
    }

    if (searchParam.type === 'string') {
      return flatMapFilter(convertToSearchableStrings(typedValues), truncateTextColumn);
    }

    if (searchParam.type === 'uri') {
      return flatMapFilter(convertToSearchableUris(typedValues), truncateTextColumn);
    }

    if (searchParam.type === 'special' || searchParam.type === 'composite') {
      // Special and composite search parameters are not supported in the database.
      return [];
    }

    throw new Error('Unrecognized search parameter type: ' + searchParam.type);
  }

  /**
   * Builds the column value for a "date" search parameter.
   * This is currently in trial mode. The intention is for this to replace all "date" and "date/time" search parameters.
   * @param value - The FHIRPath result value.
   * @returns The period column string value.
   */
  private buildPeriodColumn(value: any): string | undefined {
    const period = toPeriod(value);
    if (period) {
      return periodToRangeString(period);
    }
    return undefined;
  }

  /**
   * Writes resources values to the lookup tables.
   * @param client - The database client inside the transaction.
   * @param resource - The resource to index.
   * @param create - If true, then the resource is being created.
   */
  private async writeLookupTables(client: PoolClient, resource: WithId<Resource>, create: boolean): Promise<void> {
    for (const lookupTable of lookupTables) {
      await lookupTable.indexResource(client, resource, create);
    }
  }

  private async batchWriteLookupTables<T extends Resource>(
    client: PoolClient,
    resources: WithId<T>[],
    create: boolean
  ): Promise<void> {
    for (const lookupTable of lookupTables) {
      await lookupTable.batchIndexResources(client, resources, create);
    }
  }

  /**
   * Deletes values from lookup tables.
   * @param client - The database client inside the transaction.
   * @param resource - The resource to delete.
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
  private getAuthor(resource: Resource): Reference {
    // If the resource has an author (whether provided or from existing),
    // and the current context is allowed to write meta,
    // then use the provided value.
    const author = resource.meta?.author;
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
   * @param inheritAccounts - If true, inherit accounts from the parent resource.
   * @returns The account values.
   */
  private async getAccounts(
    existing: WithId<Resource> | undefined,
    updated: WithId<Resource>,
    inheritAccounts?: boolean
  ): Promise<Reference[] | undefined> {
    if (updated.meta && this.canWriteAccount() && !inheritAccounts) {
      // If the user specifies accounts, and they have permission, and inheritAccounts is false, then use the provided accounts.
      const updatedAccounts = this.extractAccountReferences(updated.meta);
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
      const existingAccounts = this.extractAccountReferences(existing?.meta);
      if (existingAccounts?.length) {
        for (const account of existingAccounts) {
          accounts.add(account.reference as string);
        }
      }
    } else {
      const systemRepo = getSystemRepo(this.conn); // Re-use DB connection to preserve transaction state
      const patients = await systemRepo.readReferences(getPatients(updated));
      for (const patient of patients) {
        if (patient instanceof Error) {
          getLogger().debug('Error setting patient compartment', patient);
          continue;
        }

        // If the patient has an account, then use it as the resource account.
        const patientAccounts = this.extractAccountReferences(patient.meta);
        if (patientAccounts?.length) {
          for (const account of patientAccounts) {
            if (account.reference) {
              accounts.add(account.reference);
            }
          }
        }
      }
    }

    if (accounts.size < 1) {
      return undefined;
    }

    const result: Reference[] = [];
    for (const reference of accounts) {
      result.push({ reference });
    }
    return result;
  }

  private extractAccountReferences(meta: Meta | undefined): Reference[] | undefined {
    if (!meta) {
      return undefined;
    }
    if (meta.accounts && meta.account) {
      const accounts = meta.accounts;
      if (accounts.some((a) => a.reference === meta.account?.reference)) {
        return accounts;
      }
      return [meta.account, ...accounts];
    } else {
      return arrayify(meta.accounts ?? meta.account);
    }
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
  private canPerformInteraction(
    interaction: AccessPolicyInteraction,
    resource: Resource
  ): AccessPolicyResource | undefined {
    if (!this.isSuperAdmin()) {
      // Only Super Admins can access server-critical resource types
      if (protectedResourceTypes.includes(resource.resourceType)) {
        return undefined;
      }
      // Non-Superusers can only access resources in their Project, with read-only access to linked Projects
      if (readInteractions.includes(interaction)) {
        if (!this.context.projects?.some((p) => p.id === resource.meta?.project)) {
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
      this.removeField(input, field);
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

  /**
   * Removes a field from the input resource; supports nested fields.
   * @param input - The input resource.
   * @param path - The path to the field to remove
   */
  private removeField<T extends Resource>(input: T, path: string): void {
    let last: any[] = [input];
    const pathParts = path.split('.');
    for (let i = 0; i < pathParts.length; i++) {
      const pathPart = pathParts[i];

      if (i === pathParts.length - 1) {
        // final key part
        last.forEach((item) => {
          resolveFieldName(item, pathPart).forEach((k) => {
            delete item[k];
          });
        });
      } else {
        // intermediate key part
        const next: any[] = [];
        for (const lastItem of last) {
          for (const k of resolveFieldName(lastItem, pathPart)) {
            if (lastItem[k] !== undefined) {
              if (Array.isArray(lastItem[k])) {
                next.push(...lastItem[k]);
              } else if (isObject(lastItem[k])) {
                next.push(lastItem[k]);
              }
            }
          }
        }
        last = next;
      }
    }
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
    if (this.context.author.reference === 'system') {
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
    const resource = options?.resource;

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

    if (options?.durationMs && outcome === AuditEventOutcome.Success) {
      const duration = options.durationMs / 1000; // Report duration in whole seconds
      recordHistogramValue('medplum.fhir.interaction.' + subtype.code, duration, {
        attributes: {
          resourceType: isResource(resource) ? resource?.resourceType : undefined,
        },
      });
    }
    incrementCounter(`medplum.fhir.interaction.${subtype.code}.count`, {
      attributes: {
        resourceType: isResource(resource) ? resource?.resourceType : undefined,
        result: outcome === AuditEventOutcome.Success ? 'success' : 'failure',
      },
    });

    if (getConfig().saveAuditEvents && isResource(resource) && resource?.resourceType !== 'AuditEvent') {
      auditEvent.id = this.generateId();
      this.updateResourceImpl(auditEvent, true).catch(console.error);
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
    this.assertNotClosed();
    if (this.conn) {
      // If in a transaction, then use the transaction client.
      return this.conn;
    }
    if (mode === DatabaseMode.WRITER) {
      // If we ever use a writer, then all subsequent operations must use a writer.
      this.mode = RepositoryMode.WRITER;
    }
    return getDatabasePool(this.mode === RepositoryMode.WRITER ? DatabaseMode.WRITER : mode);
  }

  /**
   * Returns a proper database connection.
   * Unlike getDatabaseClient(), this method always returns a PoolClient.
   * @param mode - The database mode.
   * @returns Database connection.
   */
  private async getConnection(mode: DatabaseMode): Promise<PoolClient> {
    this.assertNotClosed();
    if (!this.conn) {
      this.conn = await getDatabasePool(mode).connect();
    }
    return this.conn;
  }

  /**
   * Releases the database connection.
   * Include an error to remove the connection from the pool.
   * See: https://github.com/brianc/node-postgres/blob/master/packages/pg-pool/index.js#L333
   * @param err - Optional error to remove the connection from the pool.
   */
  private releaseConnection(err?: boolean | Error): void {
    if (this.conn) {
      this.conn.release(err);
      this.conn = undefined;
    }
  }

  async withTransaction<TResult>(
    callback: (client: PoolClient) => Promise<TResult>,
    options?: { serializable: boolean }
  ): Promise<TResult> {
    const config = getConfig();
    const transactionAttempts = config.transactionAttempts ?? defaultTransactionAttempts;
    let error: OperationOutcomeError | undefined;
    for (let attempt = 0; attempt < transactionAttempts; attempt++) {
      const attemptStartTime = Date.now();
      try {
        const client = await this.beginTransaction(options?.serializable ? 'SERIALIZABLE' : undefined);
        const result = await callback(client);
        await this.commitTransaction();
        if (attempt > 0) {
          getLogger().info('Completed transaction', {
            attempt,
            attemptDurationMs: Date.now() - attemptStartTime,
            transactionAttempts,
            serializable: options?.serializable ?? false,
          });
        }
        return result;
      } catch (err) {
        const operationOutcomeError = normalizeDatabaseError(err);
        // Assigning here and throwing below is necessary to satisfy TypeScript
        error = operationOutcomeError;

        // Ensure transaction is rolled back before attempting any retry
        await this.rollbackTransaction(operationOutcomeError);
        if (!this.isRetryableTransactionError(operationOutcomeError)) {
          break; // Fall through to throw statement outside of the loop
        }
      } finally {
        this.endTransaction();
      }

      const attemptDurationMs = Date.now() - attemptStartTime;

      if (attempt + 1 < transactionAttempts) {
        const baseDelayMs = config.transactionExpBackoffBaseDelayMs ?? defaultExpBackoffBaseDelayMs;
        // Attempts are 0-indexed, so first wait after first attempt will be somewhere between 75% and 125% of baseDelayMs
        // This calculation results in something like this for the default values:
        // Between attempt 0 and 1: 50 * (2^0) = 50 * [0.75, 1.25] = **[37.5, 63.5] ms**
        // Between attempt 1 and 2: 50 * (2^1) = 100 * [0.75, 1.25] = **[75, 125] ms**
        // etc...
        const delayMs = Math.ceil(baseDelayMs * 2 ** attempt * (0.75 + Math.random() * 0.5));
        getLogger().info('Retrying transaction', {
          attempt,
          attemptDurationMs,
          transactionAttempts,
          delayMs,
          baseDelayMs,
        });
        await sleep(delayMs);
      } else {
        getLogger().info('Transaction failed final attempt', {
          attempt,
          attemptDurationMs,
          transactionAttempts,
        });
      }
    }

    // Cannot be undefined: either the function returns normally from the `try` block,
    // or `error` is assigned at top of `catch` block before reaching this line
    throw error;
  }

  private async beginTransaction(isolationLevel: TransactionIsolationLevel = 'REPEATABLE READ'): Promise<PoolClient> {
    this.assertNotClosed();
    this.transactionDepth++;
    const conn = await this.getConnection(DatabaseMode.WRITER);
    if (this.transactionDepth === 1) {
      await conn.query('BEGIN ISOLATION LEVEL ' + isolationLevel);
    } else {
      await conn.query('SAVEPOINT sp' + this.transactionDepth);
    }
    return conn;
  }

  private async commitTransaction(): Promise<void> {
    this.assertInTransaction();
    const conn = await this.getConnection(DatabaseMode.WRITER);
    if (this.transactionDepth === 1) {
      await this.processPreCommit();
      await conn.query('COMMIT');
      this.transactionDepth--;
      this.releaseConnection();
      await this.processPostCommit();
    } else {
      await conn.query('RELEASE SAVEPOINT sp' + this.transactionDepth);
      this.transactionDepth--;
    }
  }

  private async rollbackTransaction(error: Error): Promise<void> {
    this.assertInTransaction();
    const conn = await this.getConnection(DatabaseMode.WRITER);
    if (this.transactionDepth === 1) {
      await conn.query('ROLLBACK');
      this.transactionDepth--;
      this.releaseConnection(error);
    } else {
      await conn.query('ROLLBACK TO SAVEPOINT sp' + this.transactionDepth);
      this.transactionDepth--;
    }
  }

  private endTransaction(): void {
    if (this.transactionDepth === 0) {
      this.releaseConnection();
    }
  }

  private assertInTransaction(): void {
    if (this.transactionDepth <= 0) {
      throw new Error('Not in transaction');
    }
  }

  async preCommit(fn: () => Promise<void>): Promise<void> {
    if (this.transactionDepth) {
      this.preCommitCallbacks.push(fn);
    } else {
      // rely on thrown errors bubbling up from here to halt the transaction
      await fn();
    }
  }

  private async processPreCommit(): Promise<void> {
    const callbacks = this.preCommitCallbacks;
    this.preCommitCallbacks = [];
    for (const cb of callbacks) {
      // rely on thrown errors bubbling up from here to halt the transaction
      await cb();
    }
  }

  async postCommit(fn: () => Promise<void>): Promise<void> {
    if (this.transactionDepth) {
      this.postCommitCallbacks.push(fn);
    } else {
      await this.invokePostCommitCallback(fn);
    }
  }

  private async processPostCommit(): Promise<void> {
    const callbacks = this.postCommitCallbacks;
    this.postCommitCallbacks = [];
    for (const cb of callbacks) {
      await this.invokePostCommitCallback(cb);
    }
  }

  private async invokePostCommitCallback(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof Error) {
        getLogger().error('Error processing post-commit callback', err);
      } else {
        getLogger().error('Error processing post-commit callback', { err });
      }
    }
  }

  /**
   * Checks whether an error represents a serialization conflict that can safely be retried.
   * NOTE: Retrying a transaction must be done in full: the entire `Repository.withTransaction()` block
   * should be re-executed, in a new transaction.
   * @param err - The error to check.
   * @returns True if the error indicates a retryable transaction failure.
   */
  private isRetryableTransactionError(err: OperationOutcomeError): boolean {
    if (this.transactionDepth) {
      // Nested transactions (i.e. savepoints) are NOT retryable per the Postgres docs;
      // the entire transaction must have been rolled back before anything can be retried:
      // "It is important to retry the complete transaction, including all logic
      // that decides which SQL to issue and/or which values to use"
      // @see https://www.postgresql.org/docs/16/mvcc-serialization-failure-handling.html
      return false;
    }
    if (err.outcome.issue.length !== 1) {
      // Multiple errors combined cannot be guaranteed to be retryable
      return false;
    }

    const issue = err.outcome.issue[0];
    return Boolean(
      issue.code === 'conflict' &&
        issue.details?.coding?.some((c) => retryableTransactionErrorCodes.includes(c.code as string))
    );
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
    if (this.transactionDepth) {
      return undefined;
    }
    const cachedValue = await getRedis().get(getCacheKey(resourceType, id));
    return cachedValue ? (JSON.parse(cachedValue) as CacheEntry<WithId<T>>) : undefined;
  }

  /**
   * Performs a bulk read of cache entries from Redis.
   * @param references - Array of FHIR references.
   * @returns Array of cache entries or undefined.
   */
  private async getCacheEntries(references: Reference[]): Promise<(CacheEntry | undefined)[]> {
    // No cache access allowed mid-transaction
    if (this.transactionDepth) {
      return new Array(references.length);
    }
    const referenceKeys = references.map((r) => r.reference as string);
    if (referenceKeys.length === 0) {
      // Return early to avoid calling mget() with no args, which is an error
      return [];
    }
    return (await getRedis().mget(referenceKeys)).map((cachedValue) =>
      cachedValue ? (JSON.parse(cachedValue) as CacheEntry) : undefined
    );
  }

  /**
   * Writes a cache entry to Redis.
   * @param resource - The resource to cache.
   */
  private async setCacheEntry(resource: WithId<Resource>): Promise<void> {
    // No cache access allowed mid-transaction
    if (this.transactionDepth) {
      const cachedResource = deepClone(resource);
      await this.postCommit(() => {
        return this.setCacheEntry(cachedResource);
      });
      return;
    }

    const projectId = resource.meta?.project;
    await getRedis().set(
      getCacheKey(resource.resourceType, resource.id),
      stringify({ resource, projectId }),
      'EX',
      REDIS_CACHE_EX_SECONDS
    );
  }

  /**
   * Deletes a cache entry from Redis.
   * @param resourceType - The resource type.
   * @param id - The resource ID.
   */
  private async deleteCacheEntry(resourceType: string, id: string): Promise<void> {
    // No cache access allowed mid-transaction
    if (this.transactionDepth) {
      await this.postCommit(() => this.deleteCacheEntry(resourceType, id));
      return;
    }

    await getRedis().del(getCacheKey(resourceType, id));
  }

  /**
   * Deletes cache entries from Redis.
   * @param resourceType - The resource type.
   * @param ids - The resource IDs.
   */
  private async deleteCacheEntries(resourceType: string, ids: string[]): Promise<void> {
    // No cache access allowed mid-transaction
    if (this.transactionDepth) {
      await this.postCommit(() => this.deleteCacheEntries(resourceType, ids));
      return;
    }

    const cacheKeys = ids.map((id) => {
      return getCacheKey(resourceType, id);
    });

    await getRedis().del(cacheKeys);
  }

  async ensureInTransaction<TResult>(callback: (client: PoolClient) => Promise<TResult>): Promise<TResult> {
    if (this.transactionDepth) {
      const client = await this.getConnection(DatabaseMode.WRITER);
      return callback(client);
    } else {
      return this.withTransaction(callback);
    }
  }

  getConfig(): RepositoryContext {
    return this.context;
  }

  [Symbol.dispose](removeConnection?: boolean): void {
    this.assertNotClosed();
    if (this.disposable) {
      if (this.transactionDepth > 0) {
        // Bad state, remove connection from pool
        getLogger().error('Closing Repository with active transaction');
        this.releaseConnection(new Error('Closing Repository with active transaction'));
      } else {
        // Good state, return healthy connection to pool
        this.releaseConnection(removeConnection);
      }
    }
    this.closed = true;
  }

  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error('Already closed');
    }
  }
}

const REDIS_CACHE_EX_SECONDS = 24 * 60 * 60; // 24 hours in seconds
const PROFILE_CACHE_EX_SECONDS = 5 * 60; // 5 minutes in seconds

/**
 * Returns the redis cache key for the given resource type and resource ID.
 * @param resourceType - The resource type.
 * @param id - The resource ID.
 * @returns The Redis cache key.
 */
function getCacheKey(resourceType: string, id: string): string {
  return `${resourceType}/${id}`;
}

/**
 * Writes a FHIR profile cache entry to Redis.
 * @param profile - The profile structure definition.
 */
async function cacheProfile(profile: StructureDefinition): Promise<void> {
  if (!profile.url || !profile.meta?.project) {
    return;
  }
  profile = await getSystemRepo().readReference(createReference(profile));
  await getRedis().set(
    getProfileCacheKey(profile.meta?.project as string, profile.url),
    JSON.stringify({ resource: profile, projectId: profile.meta?.project }),
    'EX',
    PROFILE_CACHE_EX_SECONDS
  );
}

/**
 * Writes a FHIR profile cache entry to Redis.
 * @param profile - The profile structure definition.
 */
async function removeCachedProfile(profile: StructureDefinition): Promise<void> {
  if (!profile.url || !profile.meta?.project) {
    return;
  }
  await getRedis().del(getProfileCacheKey(profile.meta.project, profile.url));
}

/**
 * Returns the redis cache key for the given profile resource.
 * @param projectId - The ID of the Project to which the profile belongs.
 * @param url - The canonical URL of the profile.
 * @returns The Redis cache key.
 */
function getProfileCacheKey(projectId: string, url: string): string {
  return `Project/${projectId}/StructureDefinition/${url}`;
}

export function getSystemRepo(conn?: PoolClient): Repository {
  return new Repository(
    {
      superAdmin: true,
      strictMode: true,
      extendedMode: true,
      author: {
        reference: 'system',
      },
      // System repo does not have an associated Project; it can write to any
    },
    conn
  );
}

function lowercaseFirstLetter(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function resolveFieldName(input: any, fieldName: string): string[] {
  if (!fieldName.endsWith('[x]')) {
    return [fieldName];
  }

  const baseKey = fieldName.slice(0, -3);
  return Object.keys(input).filter((k) => {
    if (k.startsWith(baseKey)) {
      const maybePropertyType = k.substring(baseKey.length);
      if (maybePropertyType in PropertyType || lowercaseFirstLetter(maybePropertyType) in PropertyType) {
        return true;
      }
    }
    return false;
  });
}

export function setTypedPropertyValue(target: TypedValue, path: string, replacement: TypedValue): void {
  let patchPath = '/' + path.replaceAll(/\[|\]\.|\./g, '/');
  if (patchPath.endsWith(']')) {
    patchPath = patchPath.slice(0, -1);
  }
  patchObject(target.value, [{ op: 'replace', path: patchPath, value: replacement.value }]);
}

const textEncoder = new TextEncoder();

/**
 * Apply a maximum string length to ensure the value can accommodate the maximum
 * size for a btree index entry: 2704 bytes. If the string is too large,
 * be as conservative as possible to avoid write errors by truncating to 675 characters
 * to accommodate the entire string being 4-byte UTF-8 code points.
 * @param value - The column value to truncate.
 * @returns The possibly truncated column value.
 */
function truncateTextColumn(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (textEncoder.encode(value).length <= 2704) {
    return value;
  }

  return Array.from(value).slice(0, 675).join('');
}
