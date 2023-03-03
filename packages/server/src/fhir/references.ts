import {
  createStructureIssue,
  getTypedPropertyValue,
  normalizeErrorString,
  OperationOutcomeError,
  PropertyType,
  toTypedValue,
  TypedValue,
} from '@medplum/core';
import { OperationOutcomeIssue, Reference, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Repository } from './repo';

export async function validateReferences<T extends Resource>(repo: Repository, resource: T): Promise<void> {
  return new FhirReferenceValidator(repo, resource).validate();
}

export class FhirReferenceValidator<T extends Resource> {
  readonly #issues: OperationOutcomeIssue[];
  readonly #repo: Repository;
  readonly #root: T;

  constructor(repo: Repository, root: T) {
    this.#issues = [];
    this.#repo = repo;
    this.#root = root;
  }

  async validate(): Promise<void> {
    const resource = this.#root;
    const resourceType = resource.resourceType;
    await this.#validateObject(resourceType, toTypedValue(resource));

    if (this.#issues.length > 0) {
      throw new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        id: randomUUID(),
        issue: this.#issues,
      });
    }
  }

  async #validateObject(path: string, typedValue: TypedValue): Promise<void> {
    const object = typedValue.value as Record<string, unknown>;
    for (const key of Object.keys(object)) {
      await this.#checkProperty(path, key, typedValue);
    }
  }

  async #checkProperty(basePath: string, propertyName: string, typedValue: TypedValue): Promise<void> {
    const path = basePath + '.' + propertyName;
    const value = getTypedPropertyValue(typedValue, propertyName);
    if (Array.isArray(value)) {
      for (const item of value) {
        await this.#checkPropertyValue(path, item);
      }
    } else {
      return this.#checkPropertyValue(path, value as TypedValue);
    }
  }

  async #checkPropertyValue(path: string, typedValue: TypedValue): Promise<void> {
    if (typedValue.type === PropertyType.Meta) {
      return;
    }

    if (typedValue.type === PropertyType.Reference) {
      return this.#checkReference(path, typedValue.value as Reference);
    }

    if (typeof typedValue.value === 'object') {
      return this.#validateObject(path, typedValue);
    }
  }

  async #checkReference(path: string, reference: Reference): Promise<void> {
    const refStr = reference.reference;
    if (!refStr) {
      return;
    }

    const refParts = refStr.split('/');
    if (refParts.length !== 2) {
      return;
    }

    try {
      await this.#repo.readReference(reference);
    } catch (err) {
      this.#issues.push(createStructureIssue(path, `Invalid reference: ${path} (${normalizeErrorString(err)})`));
    }
  }
}
