// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TypedValueWithPath, ValidatorOptions } from '@medplum/core';
import { getReferenceString, OperationOutcomeError, Operator, validateResource } from '@medplum/core';
import type {
  CodeableConcept,
  Coding,
  OperationOutcomeIssue,
  Resource,
  StructureDefinition,
  ValueSet,
} from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getLogger } from '../../logger';
import { recordHistogramValue } from '../../otel/otel';
import { validateResourceWithJsonSchema } from '../jsonschema';
import { findTerminologyResource } from '../operations/utils/terminology';
import { validateCodingInValueSet } from '../operations/valuesetvalidatecode';
import type { Repository } from '../repo';
import { cacheProfile, getCachedProfile } from './profile-cache';

/**
 * Validates a resource against the current project configuration.
 * If strict mode is enabled (default), validates against base StructureDefinition and all profiles.
 * If strict mode is disabled, validates against the legacy JSONSchema validator.
 * Throws on validation errors.
 * Returns silently on success.
 * @param repo - The repository to use for validation.
 * @param resource - The candidate resource to validate.
 * @param forceStrictMode - If true, validates against the strict mode validator regardless of the project configuration.
 */
export async function validateRepositoryResource(
  repo: Repository,
  resource: Resource,
  forceStrictMode?: boolean
): Promise<void> {
  if (forceStrictMode || repo.getConfig().strictMode) {
    await validateRepositoryResourceStrictly(repo, resource);
  } else {
    // Perform loose validation first to detect any severe issues
    validateResourceWithJsonSchema(resource);

    // Attempt strict validation and log warnings on failure
    try {
      await validateRepositoryResourceStrictly(repo, resource);
    } catch (err: any) {
      getLogger().warn('Strict validation would fail', {
        resource: getReferenceString(resource),
        err,
      });
    }
  }
}

export async function validateRepositoryResourceStrictly(repo: Repository, resource: Resource): Promise<void> {
  const logger = getLogger();
  const start = process.hrtime.bigint();
  const context = repo.getConfig();

  // Prepare validator options
  let options: ValidatorOptions | undefined;
  if (context.validateTerminology) {
    const tokens = Object.create(null);
    options = { ...options, collect: { tokens } };
  }

  // Validate resource against base FHIR spec
  const issues = validateResource(resource, { ...options, base64BinaryMaxBytes: getConfig().base64BinaryMaxBytes });

  for (const issue of issues) {
    logger.warn(`Validator warning: ${issue.details?.text}`, { project: context.projects?.[0]?.id, issue });
  }

  // Validate profiles after verifying compliance with base spec
  const profileUrls = resource.meta?.profile;
  if (profileUrls) {
    await validateProfiles(repo, resource, profileUrls, options);
  }

  // (Optionally) check any required terminology bindings found
  if (context.validateTerminology && options?.collect?.tokens) {
    await validateTerminology(repo, options.collect.tokens, issues);
    if (issues.some((iss) => iss.severity === 'error')) {
      throw new OperationOutcomeError({ resourceType: 'OperationOutcome', issue: issues });
    }
  }

  // Track latency for successful validation
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

async function validateProfiles(
  repo: Repository,
  resource: Resource,
  profileUrls: string[],
  options?: ValidatorOptions
): Promise<void> {
  const logger = getLogger();
  for (const url of profileUrls) {
    const loadStart = process.hrtime.bigint();
    const profile = await loadProfile(repo, url);
    const loadTime = Number(process.hrtime.bigint() - loadStart);
    if (!profile) {
      logger.warn('Unknown profile referenced', {
        resource: `${resource.resourceType}/${resource.id}`,
        url,
      });
      continue;
    }

    const validateStart = process.hrtime.bigint();
    validateResource(resource, { ...options, profile });
    const validateTime = Number(process.hrtime.bigint() - validateStart);
    logger.debug('Profile loaded', {
      url,
      loadTime,
      validateTime,
    });
  }
}

async function validateTerminology(
  repo: Repository,
  tokens: Record<string, TypedValueWithPath[]>,
  issues: OperationOutcomeIssue[]
): Promise<void> {
  for (const [url, values] of Object.entries(tokens)) {
    const valueSet = await findTerminologyResource<ValueSet>(repo, 'ValueSet', url);

    const resultCache: Record<string, boolean | undefined> = Object.create(null);
    for (const value of values) {
      let codings: Coding[] | undefined;
      switch (value.type) {
        case 'CodeableConcept':
          codings = (value.value as CodeableConcept).coding;
          break;
        case 'Coding':
          codings = [value.value as Coding];
          break;
        default: {
          const cachedResult = resultCache[`${value.type}|${value.value}`];
          if (cachedResult === false) {
            issues.push({
              severity: 'error',
              code: 'value',
              details: { text: `Value ${JSON.stringify(value.value)} did not satisfy terminology binding ${url}` },
              expression: [value.path],
            });
          }
          if (cachedResult !== undefined) {
            continue;
          }
          codings = [{ code: value.value as string }];
          break;
        }
      }
      if (!codings?.length) {
        continue;
      }

      const matchedCoding = await validateCodingInValueSet(repo, valueSet, codings);
      resultCache[`${value.type}|${value.value}`] = Boolean(matchedCoding);
      if (!matchedCoding) {
        issues.push({
          severity: 'error',
          code: 'value',
          details: { text: `Value ${JSON.stringify(value.value)} did not satisfy terminology binding ${url}` },
          expression: [value.path],
        });
      }
    }
  }
}

async function loadProfile(repo: Repository, url: string): Promise<StructureDefinition | undefined> {
  const context = repo.getConfig();
  if (context.projects?.length) {
    // Try loading from cache, using all available Project IDs
    const cachedProfile = await getCachedProfile(context.projects, url);
    if (cachedProfile) {
      return cachedProfile;
    }
  }

  // Fall back to loading from the DB; descending version sort approximates version resolution for some cases
  const profile = await repo.searchOne<StructureDefinition>({
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

  if (context.projects?.length && profile) {
    await cacheProfile(profile);
  }
  return profile;
}
