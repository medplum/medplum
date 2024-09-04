import {
  badRequest,
  crawlResource,
  createReference,
  createStructureIssue,
  normalizeErrorString,
  OperationOutcomeError,
  parseSearchRequest,
  PropertyType,
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
const SYSTEM_REFERENCE_PATHS = ['Project.owner', 'Project.link.project'];

async function validateReference(
  repo: Repository,
  reference: Reference,
  issues: OperationOutcomeIssue[],
  path: string
): Promise<void> {
  if (reference.reference?.split?.('/')?.length !== 2) {
    return;
  }

  try {
    const validatingRepo = SYSTEM_REFERENCE_PATHS.includes(path) ? getSystemRepo() : repo;
    await validatingRepo.readReference(reference);
  } catch (err) {
    issues.push(createStructureIssue(path, `Invalid reference (${normalizeErrorString(err)})`));
  }
}

function isCheckableReference(propertyValue: TypedValue | TypedValue[]): boolean {
  const valueType = Array.isArray(propertyValue) ? propertyValue[0].type : propertyValue.type;
  return valueType === PropertyType.Reference;
}

export async function validateReferences<T extends Resource>(repo: Repository, resource: T): Promise<void> {
  const issues: OperationOutcomeIssue[] = [];
  await crawlResource(
    resource,
    {
      async visitPropertyAsync(parent, _key, path, propertyValue, _schema) {
        if (!isCheckableReference(propertyValue) || parent.type === PropertyType.Meta) {
          return;
        }

        if (Array.isArray(propertyValue)) {
          for (let i = 0; i < propertyValue.length; i++) {
            const reference = propertyValue[i].value as Reference;
            await validateReference(repo, reference, issues, path + '[' + i + ']');
          }
        } else {
          const reference = propertyValue.value as Reference;
          await validateReference(repo, reference, issues, path);
        }
      },
    },
    { skipMissingProperties: true }
  );

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
  reference: Reference,
  path: string
): Promise<Reference | undefined> {
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

  return createReference(matches[0]);
}

export async function replaceConditionalReferences<T extends Resource>(repo: Repository, resource: T): Promise<T> {
  await crawlResource(
    resource,
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
