import {
  createStructureIssue,
  getTypedPropertyValue,
  normalizeErrorString,
  OperationOutcomeError,
  PropertyType,
  toTypedValue,
  TypedValue,
} from '@medplum/core';
import { OperationOutcomeIssue, Project, Reference, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { getSystemRepo } from './repo';

export async function validateReferences<T extends Resource>(
  resource: T,
  allowedProjects?: Project['id'][]
): Promise<void> {
  return new FhirReferenceValidator(resource, allowedProjects).validate();
}

export class FhirReferenceValidator<T extends Resource> {
  private readonly issues: OperationOutcomeIssue[];
  private readonly allowedProjects?: Project['id'][];
  private readonly root: T;

  constructor(root: T, allowedProjects?: Project['id'][]) {
    this.issues = [];
    this.allowedProjects = allowedProjects;
    this.root = root;
  }

  async validate(): Promise<void> {
    const resource = this.root;
    const resourceType = resource.resourceType;
    await this.validateObject(resourceType, toTypedValue(resource));

    if (this.issues.length > 0) {
      throw new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        id: randomUUID(),
        issue: this.issues,
      });
    }
  }

  private async validateObject(path: string, typedValue: TypedValue): Promise<void> {
    const object = typedValue.value as Record<string, unknown>;
    for (const key of Object.keys(object)) {
      await this.checkProperty(path, key, typedValue);
    }
  }

  private async checkProperty(basePath: string, propertyName: string, typedValue: TypedValue): Promise<void> {
    const path = basePath + '.' + propertyName;
    const value = getTypedPropertyValue(typedValue, propertyName);
    if (Array.isArray(value)) {
      for (const item of value) {
        await this.checkPropertyValue(path, item);
      }
    } else if (value) {
      await this.checkPropertyValue(path, value);
    }
  }

  private async checkPropertyValue(path: string, typedValue: TypedValue): Promise<void> {
    if (typedValue.type === PropertyType.Meta) {
      return;
    }
    if (typedValue.type === PropertyType.Reference) {
      await this.checkReference(path, typedValue.value as Reference);
    }
    if (typeof typedValue.value === 'object') {
      await this.validateObject(path, typedValue);
    }
  }

  private async checkReference(path: string, reference: Reference): Promise<void> {
    const refStr = reference.reference;
    if (!refStr) {
      return;
    }

    const refParts = refStr.split('/');
    if (refParts.length !== 2) {
      return;
    }
    if (!this.root.meta?.project) {
      return;
    }

    try {
      const systemRepo = getSystemRepo();
      const target = await systemRepo.readReference(reference);
      if (
        target.meta?.project &&
        target.meta.project !== this.root.meta.project &&
        !this.allowedProjects?.includes(target.meta.project)
      ) {
        this.issues.push(createStructureIssue(path, `Invalid reference (Not found)`));
      }
    } catch (err) {
      this.issues.push(createStructureIssue(path, `Invalid reference (${normalizeErrorString(err)})`));
    }
  }
}
