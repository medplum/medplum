import {
  badRequest,
  crawlResource,
  createReference,
  createStructureIssue,
  getTypedPropertyValueWithPath,
  normalizeErrorString,
  OperationOutcomeError,
  parseSearchRequest,
  PropertyType,
  toTypedValue,
  TypedValue,
  TypedValueWithPath,
} from '@medplum/core';
import { OperationOutcomeIssue, Reference, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Repository, setTypedPropertyValue } from './repo';

type ScanFn = (tv: TypedValue, path: string) => Promise<TypedValue | undefined>;

async function validateReference(
  reference: Reference,
  repo: Repository,
  issues: OperationOutcomeIssue[],
  path: string
): Promise<void> {
  if (reference.reference?.split?.('/')?.length !== 2) {
    return;
  }

  try {
    await repo.readReference(reference);
  } catch (err) {
    issues.push(createStructureIssue(path, `Invalid reference (${normalizeErrorString(err)})`));
  }
}

export async function validateReferences<T extends Resource>(resource: T, repo: Repository): Promise<void> {
  const issues: OperationOutcomeIssue[] = [];
  await crawlResource(
    resource,
    {
      async visitPropertyAsync(parent, _key, path, propertyValue, _schema) {
        const valueType = Array.isArray(propertyValue) ? propertyValue[0].type : propertyValue.type;
        if (valueType !== PropertyType.Reference) {
          return;
        }
        if (parent.type === PropertyType.Meta) {
          return;
        }

        if (Array.isArray(propertyValue)) {
          for (let i = 0; i < propertyValue.length; i++) {
            const reference = propertyValue[i].value as Reference;
            await validateReference(reference, repo, issues, path + '[' + i + ']');
          }
        } else {
          const reference = propertyValue.value as Reference;
          await validateReference(reference, repo, issues, path);
        }
      },
    },
    { excludeMissingProperties: true }
  );

  if (issues.length > 0) {
    throw new OperationOutcomeError({
      resourceType: 'OperationOutcome',
      id: randomUUID(),
      issue: issues,
    });
  }
}

export async function replaceConditionalReferences<T extends Resource>(resource: T, repo: Repository): Promise<T> {
  const scanner = new FhirResourceScanner(resource);
  await scanner.forEach(PropertyType.Reference, async (value, path) => {
    const reference = value.value as Reference;
    if (!reference.reference?.includes?.('?')) {
      return undefined;
    }

    const searchCriteria = parseSearchRequest(reference.reference);
    searchCriteria.sortRules = undefined;
    searchCriteria.count = 2;
    const matches = await repo.searchResources(searchCriteria);
    if (matches.length !== 1) {
      throw new OperationOutcomeError(
        badRequest(
          `Conditional reference '${reference.reference}' ${matches.length ? 'matched multiple' : 'did not match any'} resources`,
          path
        )
      );
    }

    const resolvedReference = createReference(matches[0]);
    return { type: PropertyType.Reference, value: resolvedReference };
  });

  return resource;
}

export class FhirResourceScanner {
  private readonly root: TypedValue;

  constructor(root: Resource) {
    this.root = toTypedValue(root);
  }

  async forEach(targetType: keyof typeof PropertyType, fn: ScanFn): Promise<void> {
    const resourceType = this.root.value.resourceType;
    await this.scanObject(resourceType, this.root, targetType, fn);
  }

  private async scanObject(
    path: string,
    typedValue: TypedValue,
    targetType: keyof typeof PropertyType,
    fn: ScanFn
  ): Promise<void> {
    const object = typedValue.value as Record<string, unknown>;
    for (const key of Object.keys(object)) {
      await this.checkProperty(path, key, typedValue, targetType, fn);
    }
  }

  private async checkProperty(
    basePath: string,
    propertyName: string,
    typedValue: TypedValue,
    targetType: keyof typeof PropertyType,
    fn: ScanFn
  ): Promise<void> {
    const path = basePath + '.' + propertyName;
    const value = getTypedPropertyValueWithPath(typedValue, propertyName);
    if (Array.isArray(value)) {
      for (const item of value) {
        await this.checkPropertyValue(path, item, targetType, fn);
      }
    } else if (value) {
      await this.checkPropertyValue(path, value, targetType, fn);
    }
  }

  private async checkPropertyValue(
    path: string,
    typedValue: TypedValueWithPath,
    targetType: keyof typeof PropertyType,
    fn: ScanFn
  ): Promise<void> {
    if (typedValue.type === PropertyType.Meta) {
      return;
    }

    if (typedValue.type === targetType) {
      const replacement = await fn(typedValue, path);
      if (replacement) {
        setTypedPropertyValue(this.root, typedValue.path, replacement);
      }
    }

    if (typeof typedValue.value === 'object') {
      await this.scanObject(path, typedValue, targetType, fn);
    }
  }
}
