// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { TypedValueWithPath, ValidatorOptions } from '@medplum/core';
import { getReferenceString, OperationOutcomeError, validateResource as validateAgainstFhirSpec } from '@medplum/core';
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
import type { Repository } from '../repo';
import { validateResourceWithJsonSchema } from '../jsonschema';
import { findTerminologyResource } from '../operations/utils/terminology';
import { validateCodingInValueSet } from '../operations/valuesetvalidatecode';
import { cacheProfile, getCachedProfile } from './profile-cache';

export async function validateRepositoryResource(repo: Repository, resource: Resource): Promise<void> {
  if (repo.getConfig().strictMode) {
    await validateRepositoryResourceStrictly(repo, resource);
    return;
  }

  validateResourceWithJsonSchema(resource);
  try {
    await validateRepositoryResourceStrictly(repo, resource);
  } catch (err: any) {
    getLogger().warn('Strict validation would fail', {
      resource: getReferenceString(resource),
      err,
    });
  }
}

export async function validateRepositoryResourceStrictly(repo: Repository, resource: Resource): Promise<void> {
  const logger = getLogger();
  const start = process.hrtime.bigint();

  let options: ValidatorOptions | undefined;
  if (repo.getConfig().validateTerminology) {
    const tokens = Object.create(null);
    options = { ...options, collect: { tokens } };
  }

  const issues = validateAgainstFhirSpec(resource, {
    ...options,
    base64BinaryMaxBytes: getConfig().base64BinaryMaxBytes,
  });

  for (const issue of issues) {
    logger.warn(`Validator warning: ${issue.details?.text}`, { project: repo.getConfig().projects?.[0]?.id, issue });
  }

  const profileUrls = resource.meta?.profile;
  if (profileUrls) {
    await validateProfiles(repo, resource, profileUrls, options);
  }

  if (repo.getConfig().validateTerminology && options?.collect?.tokens) {
    await validateTerminology(repo, options.collect.tokens, issues);
    if (issues.some((issue) => issue.severity === 'error')) {
      throw new OperationOutcomeError({ resourceType: 'OperationOutcome', issue: issues });
    }
  }

  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
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
    validateAgainstFhirSpec(resource, { ...options, profile });
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
  const projectIds = repo.getConfig().projects?.map((project) => project.id);
  if (projectIds?.length) {
    const cachedProfile = await getCachedProfile(projectIds, url);
    if (cachedProfile) {
      return cachedProfile;
    }
  }

  const profile = await repo.searchOne<StructureDefinition>({
    resourceType: 'StructureDefinition',
    filters: [
      {
        code: 'url',
        operator: 'eq',
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

  if (projectIds?.length && profile) {
    await cacheProfile(repo.getSystemRepo(), profile);
  }

  return profile;
}
