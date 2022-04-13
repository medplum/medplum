import { Bundle, OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import { Operation } from 'fast-json-patch';
import { MedplumClient } from './client';
import { allOk, created } from './outcomes';
import { parseSearchDefinition, SearchRequest } from './search';

/**
 * The LegacyRepositoryResult type is a tuple of operation outcome and optional resource.
 * @deprecated
 */
export type LegacyRepositoryResult<T extends Resource | undefined> = Promise<[OperationOutcome, T | undefined]>;

/**
 * The LegacyRepositoryClient is a supplementary API client that matches the legacy "Repository" API.
 * The "Repository" API is deprecated and will be removed in a future release.
 * This LegacyRepositoryClient is also deprecated and will be removed in a future release.
 * @deprecated
 */
export class LegacyRepositoryClient {
  readonly #client: MedplumClient;

  constructor(client: MedplumClient) {
    this.#client = client;
  }

  /**
   * Creates a resource.
   *
   * See: https://www.hl7.org/fhir/http.html#create
   *
   * @param resource The resource to create.
   * @returns Operation outcome and the new resource.
   * @deprecated
   */
  async createResource<T extends Resource>(resource: T): LegacyRepositoryResult<T> {
    try {
      const result = await this.#client.createResource<T>(resource);
      return [created, result];
    } catch (error) {
      return [error as OperationOutcome, undefined];
    }
  }

  /**
   * Returns a resource.
   *
   * See: https://www.hl7.org/fhir/http.html#read
   *
   * @param resourceType The FHIR resource type.
   * @param id The FHIR resource ID.
   * @returns Operation outcome and a resource.
   * @deprecated
   */
  async readResource<T extends Resource>(resourceType: string, id: string): LegacyRepositoryResult<T> {
    try {
      const resource = await this.#client.readResource<T>(resourceType, id);
      return [allOk, resource];
    } catch (error) {
      return [error as OperationOutcome, undefined];
    }
  }

  /**
   * Returns a resource by FHIR reference.
   *
   * See: https://www.hl7.org/fhir/http.html#read
   *
   * @param reference The FHIR reference.
   * @returns Operation outcome and a resource.
   * @deprecated
   */
  async readReference<T extends Resource>(reference: Reference<T>): LegacyRepositoryResult<T> {
    try {
      const resource = await this.#client.readReference<T>(reference);
      return [allOk, resource];
    } catch (error) {
      return [error as OperationOutcome, undefined];
    }
  }

  /**
   * Returns resource history.
   *
   * See: https://www.hl7.org/fhir/http.html#history
   *
   * @param resourceType The FHIR resource type.
   * @param id The FHIR resource ID.
   * @returns Operation outcome and a history bundle.
   * @deprecated
   */
  async readHistory<T extends Resource>(resourceType: string, id: string): LegacyRepositoryResult<Bundle<T>> {
    try {
      const resource = await this.#client.readHistory<T>(resourceType, id);
      return [allOk, resource];
    } catch (error) {
      return [error as OperationOutcome, undefined];
    }
  }

  /**
   * Returns a resource version.
   *
   * See: https://www.hl7.org/fhir/http.html#vread
   *
   * @param resourceType The FHIR resource type.
   * @param id The FHIR resource ID.
   * @param vid The version ID.
   * @returns Operation outcome and a resource.
   * @deprecated
   */
  async readVersion<T extends Resource>(resourceType: string, id: string, vid: string): LegacyRepositoryResult<T> {
    try {
      const resource = await this.#client.readVersion<T>(resourceType, id, vid);
      return [allOk, resource];
    } catch (error) {
      return [error as OperationOutcome, undefined];
    }
  }

  /**
   * Updates a resource.
   *
   * See: https://www.hl7.org/fhir/http.html#update
   *
   * @param resource The resource to update.
   * @returns Operation outcome and the updated resource.
   * @deprecated
   */
  async updateResource<T extends Resource>(resource: T): LegacyRepositoryResult<T> {
    try {
      const updated = await this.#client.updateResource<T>(resource);
      return [allOk, updated];
    } catch (error) {
      return [error as OperationOutcome, undefined];
    }
  }

  /**
   * Deletes a resource.
   *
   * See: https://www.hl7.org/fhir/http.html#delete
   *
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @returns Operation outcome.
   * @deprecated
   */
  async deleteResource(resourceType: string, id: string): LegacyRepositoryResult<undefined> {
    try {
      await this.#client.deleteResource(resourceType, id);
      return [allOk, undefined];
    } catch (error) {
      return [error as OperationOutcome, undefined];
    }
  }

  /**
   * Patches a resource.
   *
   * See: https://www.hl7.org/fhir/http.html#patch
   *
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @param patch Array of JSONPatch operations.
   * @returns Operation outcome and the resource.
   * @deprecated
   */
  async patchResource(resourceType: string, id: string, patch: Operation[]): LegacyRepositoryResult<Resource> {
    try {
      const resource = await this.#client.patchResource(resourceType, id, patch);
      return [allOk, resource];
    } catch (error) {
      return [error as OperationOutcome, undefined];
    }
  }

  /**
   * Searches for resources.
   *
   * See: https://www.hl7.org/fhir/http.html#search
   *
   * @param searchRequest The search request.
   * @returns The search result bundle.
   * @deprecated
   */
  async search<T extends Resource>(query: SearchRequest | string): LegacyRepositoryResult<Bundle<T>> {
    const searchRequest = typeof query === 'string' ? parseSearchDefinition(query) : query;
    try {
      const bundle = await this.#client.search<T>(searchRequest);
      return [allOk, bundle];
    } catch (error) {
      return [error as OperationOutcome, undefined];
    }
  }
}
