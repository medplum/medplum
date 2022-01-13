import {
  accessDenied,
  allOk,
  assertOk,
  badRequest,
  created,
  deepEquals,
  Filter,
  getSearchParameterDetails,
  gone,
  isGone,
  isNotFound,
  isOk,
  notFound,
  notModified,
  Operator as FhirOperator,
  SearchParameterDetails,
  SearchRequest,
  SortRule,
  stringify,
} from '@medplum/core';
import { evalFhirPath } from '@medplum/fhirpath';
import {
  AccessPolicy,
  AccessPolicyResource,
  Bundle,
  Login,
  Meta,
  OperationOutcome,
  Reference,
  Resource,
  SearchParameter,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { applyPatch, Operation } from 'fast-json-patch';
import validator from 'validator';
import { getConfig } from '../config';
import { getClient } from '../database';
import { addBackgroundJobs } from '../workers';
import { AddressTable, ContactPointTable, HumanNameTable, IdentifierTable, LookupTable } from './lookups';
import { getPatientCompartmentResourceTypes, getPatientId } from './patient';
import { rewriteAttachments, RewriteMode } from './rewrite';
import { validateResource, validateResourceType } from './schema';
import { getSearchParameter, getSearchParameters } from './search';
import { InsertQuery, Operator, SelectQuery } from './sql';
import { getStructureDefinitions } from './structure';

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
  admin?: boolean;
}

export type RepositoryResult<T extends Resource | undefined> = Promise<[OperationOutcome, T | undefined]>;

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
  new IdentifierTable(),
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
    if (!this.context.author.reference) {
      throw new Error('Invalid author reference');
    }
  }

  async createResource<T extends Resource>(resource: T): RepositoryResult<T> {
    const validateOutcome = validateResource(resource);
    if (!isOk(validateOutcome)) {
      return [validateOutcome, undefined];
    }

    return this.updateResourceImpl(
      {
        ...resource,
        id: randomUUID(),
      },
      true
    );
  }

  async readResource<T extends Resource>(resourceType: string, id: string): RepositoryResult<T> {
    if (!id || !validator.isUUID(id)) {
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
    const builder = new SelectQuery(resourceType).column('content').column('deleted').where('id', Operator.EQUALS, id);

    this.addCompartments(builder, resourceType);

    const rows = await builder.execute(client);
    if (rows.length === 0) {
      return [notFound, undefined];
    }

    if (rows[0].deleted) {
      return [gone, undefined];
    }

    return [allOk, this.removeHiddenFields(JSON.parse(rows[0].content as string))];
  }

  async readReference<T extends Resource>(reference: Reference<T>): RepositoryResult<T> {
    const parts = reference.reference?.split('/');
    if (!parts || parts.length !== 2) {
      return [badRequest('Invalid reference'), undefined];
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
  async readHistory<T extends Resource>(resourceType: string, id: string): RepositoryResult<Bundle<T>> {
    const [resourceOutcome] = await this.readResource<T>(resourceType, id);
    if (!isOk(resourceOutcome)) {
      return [resourceOutcome, undefined];
    }

    const client = getClient();
    const rows = await new SelectQuery(resourceType + '_History')
      .column('content')
      .where('id', Operator.EQUALS, id)
      .orderBy('lastUpdated', true)
      .limit(100)
      .execute(client);

    return [
      allOk,
      {
        resourceType: 'Bundle',
        type: 'history',
        entry: rows.map((row: any) => ({
          resource: this.removeHiddenFields(JSON.parse(row.content as string)),
        })),
      },
    ];
  }

  async readVersion<T extends Resource>(resourceType: string, id: string, vid: string): RepositoryResult<T> {
    if (!validator.isUUID(vid)) {
      return [badRequest('Invalid UUID'), undefined];
    }

    const [resourceOutcome] = await this.readResource<T>(resourceType, id);
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

    return [allOk, this.removeHiddenFields(JSON.parse(rows[0].content as string))];
  }

  async updateResource<T extends Resource>(resource: T): RepositoryResult<T> {
    return this.updateResourceImpl(resource, false);
  }

  private async updateResourceImpl<T extends Resource>(resource: T, create: boolean): RepositoryResult<T> {
    this.removeReadonlyFields(resource);

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

    const updated = await rewriteAttachments<T>(RewriteMode.REFERENCE, this, {
      ...existing,
      ...resource,
      meta: {
        ...existing?.meta,
        ...resource.meta,
      },
    });

    if (existing && deepEquals(existing, updated)) {
      return [notModified, existing];
    }

    const result: T = {
      ...updated,
      meta: {
        ...updated?.meta,
        versionId: randomUUID(),
        lastUpdated: this.getLastUpdated(existing, resource),
        author: this.getAuthor(resource),
      },
    };

    const project = this.getProjectId(updated);
    if (project) {
      // Need cast to overwrite a readonly property
      (result.meta as any).project = project;
    }

    const account = await this.getAccount(existing, updated);
    if (account) {
      // Need cast to overwrite a readonly property
      (result.meta as any).account = account;
    }

    try {
      await this.writeResource(result);
      await this.writeResourceVersion(result);
      await this.writeLookupTables(result);
      await addBackgroundJobs(result);
    } catch (error) {
      return [badRequest((error as Error).message), undefined];
    }

    this.removeHiddenFields(result);
    return [existing ? allOk : created, result];
  }

  /**
   * Reindexes all resources of the specified type.
   * This is only available to the system account.
   * This should not result in any change to resources or history.
   * @param resourceType The resource type.
   */
  async reindexResourceType(resourceType: string): RepositoryResult<undefined> {
    if (!this.isSystem()) {
      return [accessDenied, undefined];
    }

    const client = getClient();
    const builder = new SelectQuery(resourceType).column({ tableName: resourceType, columnName: 'id' });
    this.addDeletedFilter(builder);

    const rows = await builder.execute(client);
    for (const { id } of rows) {
      await this.reindexResource(resourceType, id);
    }
    return [allOk, undefined];
  }

  /**
   * Reindexes the resource.
   * This is only available to the system account.
   * This should not result in any change to the resource or its history.
   * @param resourceType The resource type.
   * @param id The resource ID.
   */
  async reindexResource<T extends Resource>(resourceType: string, id: string): RepositoryResult<T> {
    if (!this.isSystem()) {
      return [accessDenied, undefined];
    }

    const [readOutcome, resource] = await this.readResource<T>(resourceType, id);
    if (!isOk(readOutcome)) {
      return [readOutcome, undefined];
    }

    try {
      await this.writeResource(resource as T);
      await this.writeLookupTables(resource as T);
    } catch (error) {
      return [badRequest((error as Error).message), undefined];
    }

    return [allOk, resource as T];
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
      content,
    };

    await new InsertQuery(resourceType, columns).mergeOnConflict(true).execute(client);

    await new InsertQuery(resourceType + '_History', {
      id,
      versionId: randomUUID(),
      lastUpdated,
      content,
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

    const count = searchRequest.count || 20;
    const page = searchRequest.page || 0;
    builder.limit(count);
    builder.offset(count * page);

    const total = await this.getTotalCount(searchRequest);
    const rows = await builder.execute(client);

    return [
      allOk,
      {
        resourceType: 'Bundle',
        type: 'searchest',
        total,
        entry: rows.map((row) => ({
          resource: this.removeHiddenFields(JSON.parse(row.content as string)),
        })),
      },
    ];
  }

  /**
   * Returns the total number of matching results for a search request.
   * This ignores page number and page size.
   * @param searchRequest The search request.
   * @returns The total number of matching results.
   */
  private async getTotalCount(searchRequest: SearchRequest): Promise<number> {
    const client = getClient();
    const builder = new SelectQuery(searchRequest.resourceType).raw(
      `COUNT (DISTINCT "${searchRequest.resourceType}"."id") AS "count"`
    );

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

    if (this.isAdmin()) {
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
    }

    if (compartmentIds.length === 0 && this.context.project !== undefined) {
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
    searchRequest.filters?.forEach((filter) => codes.add(filter.code));
    searchRequest.sortRules?.forEach((sortRule) => codes.add(sortRule.code));

    const joinedTables = new Map<string, LookupTable>();
    codes.forEach((code) => {
      const param = getSearchParameter(resourceType, code);
      if (param) {
        const lookupTable = this.getLookupTable(param);
        if (lookupTable) {
          joinedTables.set(lookupTable.getName(), lookupTable);
        }
      }
    });

    joinedTables.forEach((lookupTable) => lookupTable.addJoin(builder, resourceType));
  }

  /**
   * Adds all search filters as "WHERE" clauses to the query builder.
   * @param builder The client query builder.
   * @param searchRequest The search request.
   */
  private addSearchFilters(builder: SelectQuery, searchRequest: SearchRequest): void {
    searchRequest.filters?.forEach((filter) => this.addSearchFilter(builder, searchRequest, filter));
  }

  /**
   * Adds a single search filter as "WHERE" clause to the query builder.
   * @param builder The client query builder.
   * @param searchRequest The search request.
   * @param filter The search filter.
   */
  private addSearchFilter(builder: SelectQuery, searchRequest: SearchRequest, filter: Filter): void {
    const resourceType = searchRequest.resourceType;

    if (this.trySpecialSearchParameter(builder, resourceType, filter)) {
      return;
    }

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

  /**
   * Returns true if the search parameter code is a special search parameter.
   *
   * See: https://www.hl7.org/fhir/search.html#all
   *
   * @param builder The client query builder.
   * @param resourceType The resource type.
   * @param filter The search filter.
   * @returns True if the search parameter is a special code.
   */
  private trySpecialSearchParameter(builder: SelectQuery, resourceType: string, filter: Filter): boolean {
    const code = filter.code;
    if (!code.startsWith('_')) {
      return false;
    }

    const op = fhirOperatorToSqlOperator(filter.operator);

    if (code === '_id') {
      builder.where({ tableName: resourceType, columnName: 'id' }, op, filter.value);
    } else if (code === '_lastUpdated') {
      builder.where({ tableName: resourceType, columnName: 'lastUpdated' }, op, filter.value);
    } else if (code === '_project') {
      builder.where('compartments', Operator.ARRAY_CONTAINS, [filter.value], 'UUID[]');
    }

    return true;
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

    const lookupTable = this.getLookupTable(param);
    if (lookupTable) {
      lookupTable.addOrderBy(builder, sortRule);
      return;
    }

    const details = getSearchParameterDetails(getStructureDefinitions(), resourceType, param);
    builder.orderBy(details.columnName, !!sortRule.descending);
  }

  /**
   * Writes the resource to the resource table.
   * This builds all search parameter columns.
   * This does *not* write the version to the history table.
   * @param resource The resource.
   */
  private async writeResource(resource: Resource): Promise<void> {
    const client = getClient();
    const resourceType = resource.resourceType;
    const meta = resource.meta as Meta;
    const content = stringify(resource);

    const columns: Record<string, any> = {
      id: resource.id,
      lastUpdated: meta.lastUpdated,
      deleted: false,
      compartments: this.getCompartments(resource),
      content,
    };

    const searchParams = getSearchParameters(resourceType);
    if (searchParams) {
      for (const searchParam of Object.values(searchParams)) {
        this.buildColumn(resource, columns, searchParam);
      }
    }

    await new InsertQuery(resourceType, columns).mergeOnConflict(true).execute(client);
  }

  /**
   * Writes a version of the resource to the resource history table.
   * @param resource The resource.
   */
  private async writeResourceVersion(resource: Resource): Promise<void> {
    const client = getClient();
    const resourceType = resource.resourceType;
    const meta = resource.meta as Meta;
    const content = stringify(resource);

    await new InsertQuery(resourceType + '_History', {
      id: resource.id,
      versionId: meta.versionId,
      lastUpdated: meta.lastUpdated,
      content,
    }).execute(client);
  }

  /**
   * Builds a list of compartments for the resource for writing.
   * FHIR compartments are used for two purposes.
   * 1) Search narrowing (i.e., /Patient/123/Observation searches within the patient compartment).
   * 2) Access controls.
   * @param resource The resource.
   * @returns The list of compartments for the resource.
   */
  private getCompartments(resource: Resource): string[] {
    const result = new Set<string>();

    if (resource.meta?.project) {
      result.add(resource.meta.project);
    }

    if (resource.meta?.account) {
      result.add(resolveId(resource.meta.account) as string);
    }

    const patientId = getPatientId(resource);
    if (patientId) {
      result.add(patientId);
    }

    return Array.from(result);
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
    const values = evalFhirPath(searchParam.expression as string, resource);

    if (values.length > 0) {
      if (details.array) {
        columns[details.columnName] = values.map((v) => this.buildColumnValue(searchParam, v));
      } else {
        columns[details.columnName] = this.buildColumnValue(searchParam, values[0]);
      }
    }
  }

  /**
   * Builds a single value for a given search parameter.
   * If the search parameter is an array, then this method will be called for each element.
   * If the search parameter is not an array, then this method will be called for the value.
   * @param searchParam The search parameter definition.
   * @param value The FHIR resource value.
   * @returns The column value.
   */
  private buildColumnValue(searchParam: SearchParameter, value: any): any {
    if (searchParam.type === 'boolean') {
      return value === 'true';
    }

    if (searchParam.type === 'date') {
      return this.buildDateColumn(value);
    }

    if (searchParam.type === 'reference') {
      return this.buildReferenceColumns(searchParam, value);
    }

    if (searchParam.type === 'token') {
      return this.buildTokenColumn(value);
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
    }
    return undefined;
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
  private async getAccount(existing: Resource | undefined, updated: Resource): Promise<Reference | undefined> {
    const account = updated.meta?.account;
    if (account && this.canWriteMeta()) {
      // If the user specifies an account, allow it if they have permission.
      return account;
    }

    if (this.context.accessPolicy?.compartment) {
      // If the user access policy specifies a comparment, then use it as the account.
      return this.context.accessPolicy?.compartment;
    }

    if (updated.resourceType !== 'Patient') {
      const patientId = getPatientId(updated);
      if (patientId) {
        // If the resource is in a patient compartment, then lookup the patient.
        const [patientOutcome, patient] = await systemRepo.readResource('Patient', patientId);
        if (isOk(patientOutcome) && patient?.meta?.account) {
          // If the patient has an account, then use it as the resource account.
          return patient.meta.account;
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
    return this.isSystem() || this.isAdmin();
  }

  /**
   * Determines if the current user can manually set meta fields.
   * @returns True if the current user can manually set meta fields.
   */
  private canWriteMeta(): boolean {
    return this.isSystem() || this.isAdmin();
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
        if (resourcePolicy.resourceType === resourceType || resourcePolicy.resourceType === '*') {
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
        if (resourcePolicy.resourceType === resourceType || resourcePolicy.resourceType === '*') {
          return !resourcePolicy.readonly;
        }
      }
    }
    return false;
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
        delete input[field as keyof T];
      }
    }
    return input;
  }

  /**
   * Removes readonly fields from a resource as defined by the access policy.
   * This should be called for any "write" operation.
   * @param input The input resource.
   */
  private removeReadonlyFields<T extends Resource>(input: T): T {
    const policy = this.getResourceAccessPolicy(input.resourceType);
    if (policy?.readonlyFields) {
      for (const field of policy.readonlyFields) {
        delete input[field as keyof T];
      }
    }
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

  private isSystem(): boolean {
    return this.context.author.reference === 'system';
  }

  private isAdmin(): boolean {
    return !!this.context.admin || this.isAdminClient();
  }

  private isAdminClient(): boolean {
    const { adminClientId } = getConfig();
    return !!adminClientId && this.context.author.reference === 'ClientApplication/' + adminClientId;
  }
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
    case FhirOperator.NOT_EQUALS:
      return Operator.NOT_EQUALS;
    case FhirOperator.GREATER_THAN:
      return Operator.GREATER_THAN;
    case FhirOperator.GREATER_THAN_OR_EQUALS:
      return Operator.GREATER_THAN_OR_EQUALS;
    case FhirOperator.LESS_THAN:
      return Operator.LESS_THAN;
    case FhirOperator.LESS_THAN_OR_EQUALS:
      return Operator.LESS_THAN_OR_EQUALS;
    default:
      throw new Error(`Unknown FHIR operator: ${fhirOperator}`);
  }
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
  let accessPolicy: AccessPolicy | undefined = undefined;

  if (!login.profile?.reference) {
    throw new Error('Cannot create repo for login without profile');
  }

  if (login.accessPolicy) {
    const [accessPolicyOutcome, accessPolicyResource] = await systemRepo.readReference(login.accessPolicy);
    assertOk(accessPolicyOutcome, accessPolicyResource);
    accessPolicy = accessPolicyResource;
  }

  // If the resource is an "actor" resource,
  // then look it up for a synthetic access policy.
  // Actor resources: Bot, ClientApplication, Subscription
  // Synthetic access policy:
  // If the profile has a profile.meta.account,
  // Always write with account as the compartment
  // Always read with the account as a filter
  if (login.profile) {
    const profileType = login.profile.reference;
    if (
      profileType &&
      (profileType.startsWith('Bot') ||
        profileType.startsWith('ClientApplication') ||
        profileType.startsWith('Subscription'))
    ) {
      const [profileOutcome, profileResource] = await systemRepo.readReference(login.profile);
      assertOk(profileOutcome, profileResource);
      if (profileResource.meta?.account) {
        accessPolicy = buildSyntheticAccessPolicy(profileResource.meta.account);
      }
    }
  }

  return new Repository({
    project: resolveId(login.project) as string,
    author: login.profile as Reference,
    admin: login.admin,
    accessPolicy,
  });
}

/**
 * Builds a synthetic access policy for the specified compartment/account.
 * This is used for automated accounts, such as Bot, ClientApplication, and Subscription.
 * For any patient-related resource, the access policy is restricted to the account.
 * For any non-patient-related resource, the access policy is restricted to the project.
 * @param compartment The compartment reference.
 * @returns A synthetic access policy for the compartment.
 */
function buildSyntheticAccessPolicy(compartment: Reference): AccessPolicy {
  const patientResourceTypes = getPatientCompartmentResourceTypes();
  return {
    resourceType: 'AccessPolicy',
    compartment,
    resource: [
      ...patientResourceTypes.map((t) => ({
        resourceType: t,
        compartment,
      })),
      {
        resourceType: '*',
      },
    ],
  };
}

export const systemRepo = new Repository({
  author: {
    reference: 'system',
  },
});
