import {
  badRequest,
  crawlTypedValueAsync,
  createReference,
  createStructureIssue,
  normalizeErrorString,
  OperationOutcomeError,
  parseSearchRequest,
  PropertyType,
  toTypedValue,
  TypedValue,
} from '@medplum/core';
import { OperationOutcomeIssue, Reference, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { getSystemRepo, Repository } from './repo';

/**
 * Exceptional, system-level references that should use systemRepo for validation
 *
 * Project.owner:
 * `User` reference which typically does not have meta.compartment specified
 * and is not technically in the project and thus would not be visible through
 * the non-system repo.
 *
 * Project.link.project:
 * The synthetic Project policy from `applyProjectAdminAccessPolicy` applies
 * a criteria that requires Project.id matches the admin's ProjectMembership.project
 * reference which will always fail for linked projects.
 */
const SYSTEM_REFERENCE_PATHS = ['Project.owner', 'Project.link.project', 'ProjectMembership.user'];

async function validateReferences(
  repo: Repository,
  references: Record<string, Reference>,
  issues: OperationOutcomeIssue[]
): Promise<void> {
  const toValidate = Object.values(references);
  const paths = Object.keys(references);

  const validated = await repo.readReferences(toValidate);
  for (let i = 0; i < validated.length; i++) {
    const reference = validated[i];
    if (reference instanceof Error) {
      const path = paths[i];
      issues.push(createStructureIssue(path, `Invalid reference (${normalizeErrorString(reference)})`));
    }
  }
}

function isCheckableReference(propertyValue: TypedValue | TypedValue[]): boolean {
  const valueType = Array.isArray(propertyValue) ? propertyValue[0].type : propertyValue.type;
  return valueType === PropertyType.Reference;
}

function shouldValidateReference(ref: Reference): boolean {
  return Boolean(ref.reference && !ref.reference.startsWith('%'));
}

export async function validateResourceReferences<T extends Resource>(repo: Repository, resource: T): Promise<void> {
  const references: Record<string, Reference> = Object.create(null);
  const systemReferences: Record<string, Reference> = Object.create(null);

  await crawlTypedValueAsync(
    toTypedValue(resource),
    {
      async visitPropertyAsync(parent, _key, path, propertyValue, _schema) {
        if (!isCheckableReference(propertyValue) || parent.type === PropertyType.Meta) {
          return;
        }

        if (Array.isArray(propertyValue)) {
          for (let i = 0; i < propertyValue.length; i++) {
            const reference = propertyValue[i].value as Reference;
            if (!shouldValidateReference(reference)) {
              continue;
            }

            if (SYSTEM_REFERENCE_PATHS.includes(path)) {
              systemReferences[path + '[' + i + ']'] = reference;
            } else {
              references[path + '[' + i + ']'] = reference;
            }
          }
        } else if (shouldValidateReference(propertyValue.value)) {
          const reference = propertyValue.value as Reference;
          if (SYSTEM_REFERENCE_PATHS.includes(path)) {
            systemReferences[path] = reference;
          } else {
            references[path] = reference;
          }
        }
      },
    },
    { skipMissingProperties: true }
  );

  const issues: OperationOutcomeIssue[] = [];
  await validateReferences(repo, references, issues);
  await validateReferences(getSystemRepo(), systemReferences, issues);

  if (issues.length > 0) {
    throw new OperationOutcomeError({
      resourceType: 'OperationOutcome',
      id: randomUUID(),
      issue: issues,
    });
  }
}

async function resolveReplacementReference(
  repo: Repository,
  reference: Reference | undefined,
  path: string
): Promise<Reference | undefined> {
  if (!reference?.reference?.includes?.('?')) {
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

  return createReference(matches[0]);
}

export async function replaceConditionalReferences<T extends Resource>(repo: Repository, resource: T): Promise<T> {
  await crawlTypedValueAsync(
    toTypedValue(resource),
    {
      async visitPropertyAsync(parent, key, path, propertyValue, _schema) {
        if (!isCheckableReference(propertyValue)) {
          return;
        }

        if (Array.isArray(propertyValue)) {
          for (let i = 0; i < propertyValue.length; i++) {
            const reference = propertyValue[i].value as Reference;
            const replacement = await resolveReplacementReference(repo, reference, path + '[' + i + ']');

            if (replacement) {
              parent.value[key][i] = replacement;
            }
          }
        } else {
          const reference = propertyValue.value as Reference;
          const replacement = await resolveReplacementReference(repo, reference, path);

          if (replacement) {
            parent.value[key] = replacement;
          }
        }
      },
    },
    { skipMissingProperties: true }
  );

  return resource;
}
