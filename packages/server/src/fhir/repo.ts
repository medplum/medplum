import { accessDenied, AccessPolicy, allOk, assertOk, badRequest, Bundle, CompartmentDefinition, CompartmentDefinitionResource, created, Filter, getSearchParameterDetails, gone, isGone, isNotFound, isOk, Login, Meta, notFound, notModified, OperationOutcome, Operator as FhirOperator, parseFhirPath, Reference, Resource, SearchParameter, SearchParameterDetails, SearchRequest, SortRule, stringify } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { randomUUID } from 'crypto';
import { applyPatch, Operation } from 'fast-json-patch';
import validator from 'validator';
import { getConfig } from '../config';
import { MEDPLUM_PROJECT_ID, PUBLIC_PROJECT_ID } from '../constants';
import { getClient } from '../database';
import { logger } from '../logger';
import { addSubscriptionJobs } from '../workers/subscription';
import { AddressTable, ContactPointTable, HumanNameTable, IdentifierTable, LookupTable } from './lookups';
import { validateResource, validateResourceType } from './schema';
import { getSearchParameter, getSearchParameters } from './search';
import { InsertQuery, Operator, SelectQuery } from './sql';
import { getStructureDefinitions } from './structure';

/**
 * The RepositoryContext interface defines standard metadata for repository actions.
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
   * The current project reference.
   * This should be the ID/UUID of the current project.
   * This value will be included in every resource as meta.project.
   */
  project: string;

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
  admin?: boolean;
}

export type RepositoryResult<T extends Resource | undefined> = Promise<[OperationOutcome, T | undefined]>;

/**
 * Patient compartment definitions.
 * See: https://www.hl7.org/fhir/compartmentdefinition-patient.html
 */
let patientCompartment: CompartmentDefinition | undefined = undefined;

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
  'StructureDefinition'
];

/**
 * Protected resource types are in the "medplum" project.
 * Reading and writing is limited to the system account.
 */
const protectedResourceTypes = [
  'JsonWebKey',
  'Login',
  'PasswordChangeRequest',
  'Project',
  'ProjectMembership',
  'RefreshToken',
  'User',
];

/**
 * The lookup tables array includes a list of special tables for search indexing.
 */
const lookupTables: LookupTable[] = [
  new AddressTable(),
  new ContactPointTable(),
  new HumanNameTable(),
  new IdentifierTable()
];

/**
 * The Repository class manages reading and writing to the FHIR repository.
 * It is a thin layer on top of the database.
 * Repository instances should be created per author and project.
 */
export class Repository {
  private readonly context: RepositoryContext;

  constructor(context: RepositoryContext) {
    this.context = context;
  }

  async createResource<T extends Resource>(resource: T): RepositoryResult<T> {
    const validateOutcome = validateResource(resource);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    return this.updateResourceImpl({
      ...resource,
      id: randomUUID()
    }, true);
  }

  async readResource<T extends Resource>(resourceType: string, id: string): RepositoryResult<T> {
    if (!validator.isUUID(id)) {
      return [badRequest('Invalid UUID'), undefined];
    }

    const validateOutcome = validateResourceType(resourceType);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    if (!this.canReadResourceType(resourceType)) {
      return [accessDenied, undefined];
    }

    const client = getClient();
    const builder = new SelectQuery(resourceType)
      .column('content')
      .column('deleted')
      .where('id', Operator.EQUALS, id);

    this.addCompartments(builder, resourceType);

    const rows = await builder.execute(client);
    if (rows.length === 0) {
      return [notFound, undefined];
    }

    if (rows[0].deleted) {
      return [gone, undefined];
    }

    return [allOk, JSON.parse(rows[0].content as string)];
  }

  async readReference<T extends Resource>(reference: Reference<T>): RepositoryResult<T> {
    const parts = reference.reference?.split('/');
    if (!parts || parts.length !== 2) {
      return [badRequest('Invalid reference'), undefined];
    }
    return this.readResource(parts[0], parts[1]);
  }

  async readHistory(resourceType: string, id: string): RepositoryResult<Bundle> {
    const [resourceOutcome] = await this.readResource(resourceType, id);
    if (!isOk(resourceOutcome)) {
      return [resourceOutcome, undefined];
    }

    const client = getClient();
    const rows = await new SelectQuery(resourceType + '_History')
      .column('content')
      .where('id', Operator.EQUALS, id)
      .execute(client);

    return [allOk, {
      resourceType: 'Bundle',
      type: 'history',
      entry: rows.map((row: any) => ({
        resource: JSON.parse(row.content as string)
      }))
    }];
  }

  async readVersion(resourceType: string, id: string, vid: string): RepositoryResult<Resource> {
    if (!validator.isUUID(vid)) {
      return [badRequest('Invalid UUID'), undefined];
    }

    const [resourceOutcome] = await this.readResource(resourceType, id);
    if (!isOk(resourceOutcome) && !isGone(resourceOutcome)) {
      return [resourceOutcome, undefined];
    }

    const client = getClient();
    const rows = await new SelectQuery(resourceType + '_History')
      .column('content')
      .where('id', Operator.EQUALS, id)
      .where('versionId', Operator.EQUALS, vid)
      .execute(client);

    if (rows.length === 0) {
      return [notFound, undefined];
    }

    return [allOk, JSON.parse(rows[0].content as string)];
  }

  async updateResource<T extends Resource>(resource: T): RepositoryResult<T> {
    return this.updateResourceImpl(resource, false);
  }

  private async updateResourceImpl<T extends Resource>(resource: T, create: boolean): RepositoryResult<T> {
    const validateOutcome = validateResource(resource);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    const { resourceType, id } = resource;
    if (!id) {
      return [badRequest('Missing id'), undefined];
    }

    if (!this.canWriteResourceType(resourceType)) {
      return [accessDenied, undefined];
    }

    const [existingOutcome, existing] = await this.readResource<T>(resourceType, id);
    if (!isOk(existingOutcome) && !isNotFound(existingOutcome) && !isGone(existingOutcome)) {
      return [existingOutcome, undefined];
    }

    if (!create && isNotFound(existingOutcome) && !this.canSetId()) {
      return [existingOutcome, undefined];
    }

    const updated: T = {
      ...existing,
      ...resource,
      meta: {
        ...existing?.meta,
        ...resource.meta
      }
    };

    if (stringify(existing) === stringify(updated)) {
      return [notModified, existing as T];
    }

    const result: T = {
      ...updated,
      meta: {
        ...updated?.meta,
        versionId: randomUUID(),
        lastUpdated: this.getLastUpdated(resource),
        project: this.getProjectId(updated),
        author: this.getAuthor(updated)
      }
    }

    try {
      await this.write(result);
    } catch (error) {
      logger.debug('Write error: ' + error);
      return [badRequest((error as Error).message), undefined];
    }

    return [existing ? allOk : created, result];
  }

  async deleteResource(resourceType: string, id: string): RepositoryResult<undefined> {
    const [readOutcome, resource] = await this.readResource(resourceType, id);
    if (!isOk(readOutcome)) {
      return [readOutcome, undefined];
    }

    if (!this.canWriteResourceType(resourceType)) {
      return [accessDenied, undefined];
    }

    const client = getClient();
    const lastUpdated = new Date();
    const content = '';
    const columns: Record<string, any> = {
      id,
      lastUpdated,
      deleted: true,
      compartments: [],
      content
    };

    await new InsertQuery(resourceType, columns).mergeOnConflict(true).execute(client);

    await new InsertQuery(resourceType + '_History', {
      id,
      versionId: randomUUID(),
      lastUpdated,
      content
    }).execute(client);

    await this.deleteFromLookupTables(resource as Resource);

    return [allOk, undefined];
  }

  async patchResource(resourceType: string, id: string, patch: Operation[]): RepositoryResult<Resource> {
    const [readOutcome, resource] = await this.readResource(resourceType, id);
    if (!isOk(readOutcome)) {
      return [readOutcome, undefined];
    }

    const patchResult = applyPatch(resource as Resource, patch);
    const patchedResource = patchResult.newDocument;
    return this.updateResource(patchedResource);
  }

  async search<T extends Resource>(searchRequest: SearchRequest): RepositoryResult<Bundle<T>> {
    const resourceType = searchRequest.resourceType;
    const validateOutcome = validateResourceType(resourceType);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    if (!this.canReadResourceType(resourceType)) {
      return [accessDenied, undefined];
    }

    const client = getClient();
    const builder = new SelectQuery(resourceType)
      .column({ tableName: resourceType, columnName: 'id' })
      .column({ tableName: resourceType, columnName: 'content' });

    this.addDeletedFilter(builder);
    this.addCompartments(builder, resourceType);
    this.addJoins(builder, searchRequest);
    this.addSearchFilters(builder, searchRequest);
    this.addSortRules(builder, searchRequest);

    const count = searchRequest.count || 10;
    const page = searchRequest.page || 0;
    builder.limit(count);
    builder.offset(count * page);

    const total = await this.getTotalCount(searchRequest);
    const rows = await builder.execute(client);

    return [allOk, {
      resourceType: 'Bundle',
      type: 'searchest',
      total,
      entry: rows.map(row => ({
        resource: JSON.parse(row.content as string)
      }))
    }];
  }

  /**
   * Returns the total number of matching results for a search request.
   * This ignores page number and page size.
   * @param searchRequest The search request.
   * @returns The total number of matching results.
   */
  private async getTotalCount(searchRequest: SearchRequest): Promise<number> {
    const client = getClient();
    const builder = new SelectQuery(searchRequest.resourceType)
      .raw(`COUNT (DISTINCT "${searchRequest.resourceType}"."id") AS "count"`)

    this.addDeletedFilter(builder);
    this.addCompartments(builder, searchRequest.resourceType);
    this.addJoins(builder, searchRequest);
    this.addSearchFilters(builder, searchRequest);
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
   * Adds compartment restrictions to the query.
   * @param builder The select query builder.
   * @param resourceType The resource type for compartments.
   */
  private addCompartments(builder: SelectQuery, resourceType: string): void {
    if (publicResourceTypes.includes(resourceType)) {
      return;
    }

    const compartmentIds = [];

    if (this.context.accessPolicy?.resource) {
      for (const policy of this.context.accessPolicy.resource) {
        if (policy.resourceType === resourceType) {
          const policyCompartmentId = resolveId(policy.compartment);
          if (policyCompartmentId) {
            compartmentIds.push(policyCompartmentId);
          }
        }
      }
    } else if (this.context.project !== undefined && this.context.project !== MEDPLUM_PROJECT_ID) {
      compartmentIds.push(this.context.project);
    }

    if (compartmentIds.length > 0) {
      builder.where('compartments', Operator.ARRAY_CONTAINS, compartmentIds, 'UUID[]');
    }
  }

  /**
   * Adds all "JOIN" expressions to the query builder.
   * Ensures that each join is only done once.
   * @param builder The client query builder.
   * @param searchRequest The search request.
   */
  private addJoins(builder: SelectQuery, searchRequest: SearchRequest): void {
    const { resourceType } = searchRequest;

    const codes = new Set<string>();
    searchRequest.filters?.forEach(filter => codes.add(filter.code));
    searchRequest.sortRules?.forEach(sortRule => codes.add(sortRule.code));

    const joinedTables = new Map<string, LookupTable>();
    codes.forEach(code => {
      const param = getSearchParameter(resourceType, code);
      if (param) {
        const lookupTable = this.getLookupTable(param);
        if (lookupTable) {
          joinedTables.set(lookupTable.getName(), lookupTable);
        }
      }
    });

    joinedTables.forEach(lookupTable => lookupTable.addJoin(builder, resourceType));
  }

  /**
   * Adds all search filters as "WHERE" clauses to the query builder.
   * @param builder The client query builder.
   * @param searchRequest The search request.
   */
  private addSearchFilters(builder: SelectQuery, searchRequest: SearchRequest): void {
    searchRequest.filters?.forEach(filter => this.addSearchFilter(builder, searchRequest, filter));
  }

  /**
   * Adds a single search filter as "WHERE" clause to the query builder.
   * @param builder The client query builder.
   * @param searchRequest The search request.
   * @param filter The search filter.
   */
  private addSearchFilter(builder: SelectQuery, searchRequest: SearchRequest, filter: Filter): void {
    const resourceType = searchRequest.resourceType;
    const param = getSearchParameter(resourceType, filter.code);
    if (!param || !param.code) {
      return;
    }

    const lookupTable = this.getLookupTable(param);
    if (lookupTable) {
      lookupTable.addWhere(builder, filter);
      return;
    }

    const details = getSearchParameterDetails(getStructureDefinitions(), resourceType, param);
    if (param.type === 'string') {
      this.addStringSearchFilter(builder, details, filter);
    } else if (param.type === 'token') {
      this.addTokenSearchFilter(builder, details, filter.value);
    } else if (param.type === 'reference') {
      this.addReferenceSearchFilter(builder, details, filter);
    } else {
      builder.where(details.columnName, Operator.EQUALS, filter.value);
    }
  }

  private addStringSearchFilter(builder: SelectQuery, details: SearchParameterDetails, filter: Filter): void {
    if (filter.operator === FhirOperator.EXACT) {
      builder.where(details.columnName, Operator.EQUALS, filter.value);
    } else {
      builder.where(details.columnName, Operator.LIKE, '%' + filter.value + '%');
    }
  }

  private addTokenSearchFilter(builder: SelectQuery, details: SearchParameterDetails, query: string): void {
    if (details.array) {
      builder.where(details.columnName, Operator.ARRAY_CONTAINS, query);
    } else {
      builder.where(details.columnName, Operator.EQUALS, query);
    }
  }

  private addReferenceSearchFilter(builder: SelectQuery, details: SearchParameterDetails, filter: Filter): void {
    // TODO: Support optional resource type when known (param.target.length === 1)
    // TODO: Support reference queries (filter.value === 'Patient?identifier=123')
    if (details.array) {
      builder.where(details.columnName, Operator.ARRAY_CONTAINS, filter.value);
    } else {
      builder.where(details.columnName, Operator.EQUALS, filter.value);
    }
  }

  /**
   * Adds all "order by" clauses to the query builder.
   * @param builder The client query builder.
   * @param searchRequest The search request.
   */
  private addSortRules(builder: SelectQuery, searchRequest: SearchRequest): void {
    searchRequest.sortRules?.forEach(sortRule => this.addOrderByClause(builder, searchRequest, sortRule));
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

    const lookupTable = this.getLookupTable(param);
    if (lookupTable) {
      lookupTable.addOrderBy(builder, sortRule);
      return;
    }

    const details = getSearchParameterDetails(getStructureDefinitions(), resourceType, param);
    builder.orderBy(details.columnName, !!sortRule.descending);
  }

  private async write(resource: Resource): Promise<void> {
    await this.writeResource(resource);
    await this.writeLookupTables(resource);
    await addSubscriptionJobs(resource);
  }

  private async writeResource(resource: Resource): Promise<void> {
    const client = getClient();
    const resourceType = resource.resourceType;
    const meta = resource.meta as Meta;
    const content = stringify(resource);

    const columns: Record<string, any> = {
      id: resource.id,
      lastUpdated: meta.lastUpdated,
      deleted: false,
      compartments: getCompartments(resource),
      content
    };

    const searchParams = getSearchParameters(resourceType);
    if (searchParams) {
      for (const searchParam of Object.values(searchParams)) {
        this.buildColumn(resource, columns, searchParam);
      }
    }

    await new InsertQuery(resourceType, columns).mergeOnConflict(true).execute(client);

    await new InsertQuery(resourceType + '_History', {
      id: resource.id,
      versionId: meta.versionId,
      lastUpdated: meta.lastUpdated,
      content
    }).execute(client);
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
    if (this.isIndexTable(searchParam)) {
      return;
    }

    const details = getSearchParameterDetails(getStructureDefinitions(), resource.resourceType, searchParam);
    const fhirPath = parseFhirPath(searchParam.expression as string);
    const values = fhirPath.eval(resource);

    if (values.length > 0) {
      if (details.array) {
        columns[details.columnName] = values.map(v => this.buildColumnValue(searchParam, v));
      } else {
        columns[details.columnName] = this.buildColumnValue(searchParam, values[0]);
      }
    }
  }

  private buildColumnValue(searchParam: SearchParameter, value: any): any {
    if (searchParam.type === 'boolean') {
      return (value === 'true');
    }

    if (searchParam.type === 'reference') {
      return this.buildReferenceColumns(searchParam, value);
    }

    return (typeof value === 'string') ? value : stringify(value);
  }

  /**
   * Builds the columns to write for a Reference value.
   * @param searchParam The search parameter definition.
   * @param value The property value of the reference.
   */
  private buildReferenceColumns(searchParam: SearchParameter, value: any): string | undefined {
    const refStr = (value as Reference).reference;
    if (!refStr) {
      return undefined;
    }

    // TODO: Consider normalizing reference string when known (searchParam.target.length === 1)
    return refStr;
  }

  private async writeLookupTables(resource: Resource): Promise<void> {
    for (const lookupTable of lookupTables) {
      await lookupTable.indexResource(resource);
    }
  }

  private async deleteFromLookupTables(resource: Resource): Promise<void> {
    for (const lookupTable of lookupTables) {
      await lookupTable.deleteResource(resource);
    }
  }

  private isIndexTable(searchParam: SearchParameter): boolean {
    return !!this.getLookupTable(searchParam);
  }

  private getLookupTable(searchParam: SearchParameter): LookupTable | undefined {
    for (const lookupTable of lookupTables) {
      if (lookupTable.isIndexed(searchParam)) {
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
  private getLastUpdated(resource: Resource): string {
    // If the resource has a specified "lastUpdated",
    // and the current context is a ClientApplication (i.e., OAuth client credentials),
    // then allow the ClientApplication to set the date.
    const lastUpdated = resource.meta?.lastUpdated;
    if (lastUpdated && this.canWriteMeta()) {
      return lastUpdated;
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
  private getProjectId(resource: Resource): string {
    if (publicResourceTypes.includes(resource.resourceType)) {
      return PUBLIC_PROJECT_ID;
    }

    if (protectedResourceTypes.includes(resource.resourceType)) {
      return MEDPLUM_PROJECT_ID;
    }

    return resource.meta?.project ?? this.context.project;
  }

  /**
   * Returns the author reference string (resourceType/id).
   * If the current context is a ClientApplication, handles "on behalf of".
   * Otherwise uses the current context profile.
   * @param resource The FHIR resource.
   * @returns
   */
  private getAuthor(resource: Resource): Reference {
    // If the resource has an author (whether provided or from existing),
    // and the current context is a ClientApplication (i.e., OAuth client credentials),
    // then allow the ClientApplication to act on behalf of another user.
    const author = resource.meta?.author;
    if (author && this.canWriteMeta()) {
      return author;
    }

    return this.context.author;
  }

  /**
   * Determines if the current user can manually set the ID field.
   * This is very powerful, and reserved for the system account.
   * @returns True if the current user can manually set the ID field.
   */
  private canSetId(): boolean {
    return this.isSystem() || this.isAdmin();
  }

  /**
   * Determines if the current user can manually set meta fields.
   * @returns True if the current user can manually set meta fields.
   */
  private canWriteMeta(): boolean {
    return this.isSystem() || this.isAdmin() || this.isClientApplication();
  }

  /**
   * Determines if the current user can read the specified resource type.
   * @param resourceType The resource type.
   * @returns True if the current user can read the specified resource type.
   */
  private canReadResourceType(resourceType: string): boolean {
    if (this.isSystem() || this.isAdmin()) {
      return true;
    }
    if (publicResourceTypes.includes(resourceType)) {
      return true;
    }
    if (!this.context.accessPolicy) {
      return true;
    }
    if (this.context.accessPolicy.resource) {
      for (const resourcePolicy of this.context.accessPolicy.resource) {
        if (resourcePolicy.resourceType === resourceType) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Determines if the current user can write the specified resource type.
   * @param resourceType The resource type.
   * @returns True if the current user can write the specified resource type.
   */
  private canWriteResourceType(resourceType: string): boolean {
    if (this.isSystem() || this.isAdmin()) {
      return true;
    }
    if (publicResourceTypes.includes(resourceType)) {
      return false;
    }
    if (!this.context.accessPolicy) {
      return true;
    }
    if (this.context.accessPolicy.resource) {
      for (const resourcePolicy of this.context.accessPolicy.resource) {
        if (resourcePolicy.resourceType === resourceType) {
          return !resourcePolicy.readonly;
        }
      }
    }
    return false;
  }

  private isSystem(): boolean {
    return this.context.author.reference === 'system';
  }

  private isAdmin(): boolean {
    return !!this.context.admin || this.isAdminClient();
  }

  private isClientApplication(): boolean {
    return !!this.context.author.reference?.startsWith('ClientApplication/');
  }

  private isAdminClient(): boolean {
    const { adminClientId } = getConfig();
    return !!adminClientId && this.context.author.reference === 'ClientApplication/' + adminClientId;
  }
}

/**
 * Builds a list of compartments for the resource.
 * FHIR compartments are used for two purposes.
 * 1) Search narrowing (i.e., /Patient/123/Observation searches within the patient compartment).
 * 2) Access controls.
 * @param resource The resource.
 * @returns The list of compartments for the resource.
 */
export function getCompartments(resource: Resource): string[] {
  const result = new Set<string>();

  if (resource.meta?.project) {
    result.add(resource.meta.project);
  }

  const patientCompartmentProperties = getPatientCompartmentProperties(resource.resourceType);
  if (patientCompartmentProperties) {
    const patientId = getPatientId(resource, patientCompartmentProperties);
    if (patientId) {
      result.add(patientId);
    }
  }

  return Array.from(result);
}

/**
 * Returns the list of patient compartment properties, if the resource type is in a patient compartment.
 * Returns undefined otherwise.
 * See: https://www.hl7.org/fhir/compartmentdefinition-patient.html
 * @param resourceType The resource type.
 * @returns List of property names if in patient compartment; undefined otherwise.
 */
function getPatientCompartmentProperties(resourceType: string): string[] | undefined {
  const resourceList = getPatientCompartments().resource as CompartmentDefinitionResource[];
  for (const resource of resourceList) {
    if (resource.code === resourceType) {
      return resource.param;
    }
  }
  return undefined;
}

function getPatientCompartments(): CompartmentDefinition {
  if (!patientCompartment) {
    patientCompartment = readJson('fhir/r4/compartmentdefinition-patient.json') as CompartmentDefinition;
  }
  return patientCompartment;
}

/**
 * Returns the patient ID from a resource.
 * See Patient Compatment: https://www.hl7.org/fhir/compartmentdefinition-patient.json.html
 * @param resource The resource.
 * @returns The patient ID if found; undefined otherwise.
 */
export function getPatientId(resource: Resource, properties: string[]): string | undefined {
  if (resource.resourceType === 'Patient') {
    return resource.id;
  }

  for (const property of properties) {
    if (property in resource) {
      const value: Reference | Reference[] | undefined = (resource as any)[property];
      const patientId = getPatientIdFromReferenceProperty(value);
      if (patientId) {
        return patientId;
      }
    }
  }

  return undefined;
}

/**
 * Tries to return a patient ID from a reference or array of references.
 * @param reference A FHIR reference or array of references.
 * @returns The patient ID if found; undefined otherwise.
 */
function getPatientIdFromReferenceProperty(reference: Reference | Reference[] | undefined): string | undefined {
  if (!reference) {
    return undefined;
  }
  if (Array.isArray(reference)) {
    return getPatientIdFromReferenceArray(reference);
  } else {
    return getPatientIdFromReference(reference);
  }
}

/**
 * Tries to return a patient ID from an array of references.
 * @param references Array of FHIR references.
 * @returns The patient ID if found; undefined otherwise.
 */
function getPatientIdFromReferenceArray(references: Reference[]): string | undefined {
  for (const reference of references) {
    const result = getPatientIdFromReference(reference);
    if (result) {
      return result;
    }
  }
  return undefined;
}

/**
 * Tries to return a patient ID from a FHIR reference.
 * @param reference A FHIR reference.
 * @returns The patient ID if found; undefined otherwise.
 */
function getPatientIdFromReference(reference: Reference): string | undefined {
  if (reference.reference?.startsWith('Patient/')) {
    return resolveId(reference);
  }
  return undefined;
}

/**
 * Returns the ID portion of a reference.
 * For now, assumes the common convention of resourceType/id.
 * In the future, detect and handle searches (i.e., "Patient?identifier=123").
 * @param reference A FHIR reference.
 * @returns The ID portion of a reference.
 */
function resolveId(reference: Reference | undefined): string | undefined {
  return reference?.reference?.split('/')[1];
}

/**
 * Creates a repository object for the user login object.
 * Individual instances of the Repository class manage access rights to resources.
 * Login instances contain details about user compartments.
 * This method ensures that the repository is setup correctly.
 * @param login The user login.
 * @returns A repository configured for the login details.
 */
export async function getRepoForLogin(login: Login): Promise<Repository> {
  let accessPolicy = undefined;

  if (login.accessPolicy) {
    const [accessPolicyOutcome, accessPolicyResource] = await repo.readReference(login.accessPolicy);
    assertOk(accessPolicyOutcome);
    accessPolicy = accessPolicyResource as AccessPolicy;
  }

  return new Repository({
    project: resolveId(login.project) as string,
    author: login.profile as Reference,
    admin: login.admin,
    accessPolicy
  });
}

export const repo = new Repository({
  project: MEDPLUM_PROJECT_ID,
  author: {
    reference: 'system'
  }
});
