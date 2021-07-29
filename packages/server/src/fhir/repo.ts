import { Bundle, CompartmentDefinition, CompartmentDefinitionResource, Filter, Meta, OperationOutcome, Reference, Resource, SearchParameter, SearchRequest } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import validator from 'validator';
import { MEDPLUM_PROJECT_ID, PUBLIC_PROJECT_ID } from '../constants';
import { executeQuery, getKnex } from '../database';
import { logger } from '../logger';
import { HumanNameTable, IdentifierTable, LookupTable } from './lookuptable';
import { allOk, badRequest, created, isNotFound, isOk, notFound, notModified } from './outcomes';
import { validateResource, validateResourceType } from './schema';
import { getSearchParameter, getSearchParameters } from './search';

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
}

export type RepositoryResult<T extends Resource | undefined> = Promise<[OperationOutcome, T | undefined]>;

/**
 * Patient compartment definitions.
 * See: https://www.hl7.org/fhir/compartmentdefinition-patient.html
 */
const patientCompartment = readJson('fhir/r4/compartmentdefinition-patient.json') as CompartmentDefinition;

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
  'ClientApplication',
  'JsonWebKey',
  'Login',
  'PasswordChangeRequest',
  'Project',
  'RefreshToken',
  'User',
];

/**
 * The lookup tables array includes a list of special tables for search indexing.
 */
const lookupTables: LookupTable[] = [
  new HumanNameTable(),
  new IdentifierTable()
];

/**
 * The Repository class manages reading and writing to the FHIR repository.
 * It is a thin layer on top of the database.
 * Repository instances should be created per author and project.
 */
export class Repository {
  private readonly context;

  constructor(context: RepositoryContext) {
    this.context = context;
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
      .where('id', id)
      .then(executeQuery);

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
      .where('id', id)
      .then(executeQuery);

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
      .andWhere('versionId', vid)
      .then(executeQuery);

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

    const [existingOutcome, existing] = await this.readResource<T>(resourceType, id);
    if (!isOk(existingOutcome) && !isNotFound(existingOutcome)) {
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

    if (JSON.stringify(existing) === JSON.stringify(updated)) {
      return [notModified, existing as T];
    }

    const result: T = {
      ...updated,
      meta: {
        ...updated?.meta,
        versionId: randomUUID(),
        lastUpdated: new Date(),
        project: this.getProjectId(updated),
        author: this.getAuthor(updated)
      }
    }

    await this.write(result);

    return [existing ? allOk : created, result];
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
    logger.info(`DELETE resourceType=${resource?.resourceType} / id=${resource?.id}`);

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
    this.addSearchFilters(builder, searchRequest);

    const count = searchRequest.count || 10;
    const page = searchRequest.page || 0;
    builder.limit(count);
    builder.offset(count * page);

    const rows = await builder.then(executeQuery);

    return [allOk, {
      resourceType: 'Bundle',
      type: 'searchest',
      entry: rows.map(row => ({
        resource: JSON.parse(row.content as string)
      }))
    }];
  }

  private addSearchFilters(builder: Knex.QueryBuilder, searchRequest: SearchRequest): void {
    if (!searchRequest.filters) {
      return;
    }

    const resourceType = searchRequest.resourceType;
    for (const filter of searchRequest.filters) {
      const param = getSearchParameter(resourceType, filter.code);
      if (param && param.code) {
        const lookupTable = this.getLookupTable(param);
        const columnName = convertCodeToColumnName(param.code);
        if (lookupTable) {
          lookupTable.addSearchConditions(resourceType, builder, filter);
        } else if (param.type === 'string') {
          this.addStringSearchFilter(builder, columnName, filter.value);
        } else if (param.type === 'reference') {
          this.addReferenceSearchFilter(builder, param, filter);
        } else {
          builder.where(columnName, filter.value);
        }
      }
    }
  }

  private addStringSearchFilter(builder: Knex.QueryBuilder, columnName: string, query: string): void {
    builder.where(columnName, 'LIKE', '%' + query + '%');
  }

  private addReferenceSearchFilter(builder: Knex.QueryBuilder, param: SearchParameter, filter: Filter): void {
    const columnName = convertCodeToColumnName(param.code as string);
    // TODO: Support optional resource type when known (param.target.length === 1)
    // TODO: Support reference queries (filter.value === 'Patient?identifier=123')
    builder.where(columnName, filter.value);
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
      project: meta.project,
      content
    };

    const patientCompartmentProperties = getPatientCompartmentProperties(resourceType);
    if (patientCompartmentProperties) {
      columns.patientCompartment = getPatientId(resource, patientCompartmentProperties);
    }

    const searchParams = getSearchParameters(resourceType);
    if (searchParams) {
      for (const searchParam of Object.values(searchParams)) {
        this.buildColumn(resource, columns, searchParam);
      }
    }

    await knex(resourceType).insert(columns).onConflict('id').merge().then(executeQuery);

    await knex(resourceType + '_History').insert({
      id: resource.id,
      versionId: meta.versionId,
      lastUpdated: meta.lastUpdated,
      content
    }).then(executeQuery);
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

    const name = searchParam.name as string;
    if (!(name in resource)) {
      return;
    }

    const columnName = convertCodeToColumnName(searchParam.code as string);
    const value = (resource as any)[name];
    if (searchParam.type === 'date') {
      columns[columnName] = new Date(value);
    } else if (searchParam.type === 'boolean') {
      columns[columnName] = (value === 'true');
    } else if (searchParam.type === 'reference') {
      this.buildReferenceColumns(columns, searchParam, value);
    } else if (typeof value === 'string') {
      if (value.length > 128) {
        columns[columnName] = value.substr(0, 128);
      } else {
        columns[columnName] = value;
      }
    } else {
      let json = JSON.stringify(value);
      if (json.length > 128) {
        json = json.substr(0, 128);
      }
      columns[columnName] = json;
    }
  }

  /**
   * Builds the columns to write for a Reference value.
   * @param columns The output search columns.
   * @param searchParam The search parameter definition.
   * @param value The property value of the reference.
   */
  private buildReferenceColumns(columns: Record<string, any>, searchParam: SearchParameter, value: any): void {
    const refStr = (value as Reference).reference;
    if (!refStr) {
      return;
    }

    const columnName = convertCodeToColumnName(searchParam.code as string);

    // TODO: Consider normalizing reference string when known (searchParam.target.length === 1)
    columns[columnName] = refStr;
  }

  private async writeLookupTables(resource: Resource): Promise<void> {
    for (const lookupTable of lookupTables) {
      await lookupTable.indexResource(resource);
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

    return this.context.project;
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
    if (author && this.canWriteAuthor()) {
      return author;
    }

    return this.context.author;
  }

  /**
   * Determines if the current user can manually set the meta.author field.
   * @returns True if the current user can manually set the author.
   */
  private canWriteAuthor(): boolean {
    const authorRef = this.context.author.reference as string;
    return authorRef === 'system' || authorRef.startsWith('ClientApplication/');
  }
}

/**
 * Returns the list of patient compartment properties, if the resource type is in a patient compartment.
 * Returns undefined otherwise.
 * See: https://www.hl7.org/fhir/compartmentdefinition-patient.html
 * @param resourceType The resource type.
 * @returns List of property names if in patient compartment; undefined otherwise.
 */
export function getPatientCompartmentProperties(resourceType: string): string[] | undefined {
  const resourceList = patientCompartment.resource as CompartmentDefinitionResource[];
  for (const resource of resourceList) {
    if (resource.code === resourceType) {
      return resource.param;
    }
  }
  return undefined;
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
    return reference.reference.replace('Patient/', '');
  }
  return undefined;
}

/**
 * Converts a hyphen-delimited code to camelCase string.
 * @param code The search parameter code.
 * @returns The SQL column name.
 */
function convertCodeToColumnName(code: string): string {
  return code.split('-')
    .reduce((result, word, index) => result + (index ? upperFirst(word) : word), '');
}

function upperFirst(word: string): string {
  return word.charAt(0).toUpperCase() + word.substr(1);
}

export const repo = new Repository({
  project: MEDPLUM_PROJECT_ID,
  author: {
    reference: 'system'
  }
});
