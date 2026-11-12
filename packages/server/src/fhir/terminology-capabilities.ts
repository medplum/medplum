// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { concatUrls, MEDPLUM_VERSION, Operator } from '@medplum/core';
import type { CodeSystem, TerminologyCapabilities, TerminologyCapabilitiesCodeSystem } from '@medplum/fhirtypes';
import { getConfig } from '../config/loader';
import { r4ProjectId } from '../constants';
import { AuthenticatedRequestContext, tryGetRequestContext } from '../context';
import { DatabaseMode } from '../database';
import type { Repository } from './repo';

const startDate = new Date().toISOString();

let anonymousTerminologyCapabilities: Promise<TerminologyCapabilities> | undefined;

/**
 * Returns the TerminologyCapabilities resource for `GET /metadata?mode=terminology`.
 *
 * Authenticated callers see every non-retired CodeSystem their repository can read.
 * Anonymous callers see nothing.
 * @returns The TerminologyCapabilities resource.
 * @see https://hl7.org/fhir/R4/terminology-service.html#capabilities
 */
export function getTerminologyCapabilities(): Promise<TerminologyCapabilities> {
  const ctx = tryGetRequestContext();
  if (ctx instanceof AuthenticatedRequestContext) {
    return buildTerminologyCapabilities(ctx.repo);
  }
  anonymousTerminologyCapabilities ??= buildTerminologyCapabilities().catch((err) => {
    anonymousTerminologyCapabilities = undefined;
    throw err;
  });
  return anonymousTerminologyCapabilities;
}

async function buildTerminologyCapabilities(repo?: Repository): Promise<TerminologyCapabilities> {
  const fhirBaseUrl = concatUrls(getConfig().baseUrl, 'fhir/R4/');
  return {
    resourceType: 'TerminologyCapabilities',
    url: concatUrls(fhirBaseUrl, 'metadata') + '?mode=terminology',
    version: MEDPLUM_VERSION,
    name: 'MedplumTerminologyCapabilities',
    title: 'Medplum Terminology Capabilities',
    status: 'active',
    date: startDate,
    publisher: 'Medplum',
    description: 'Medplum FHIR Terminology Capabilities',
    kind: 'instance',
    software: { name: 'medplum', version: MEDPLUM_VERSION },
    implementation: { description: 'medplum', url: fhirBaseUrl },
    codeSystem: repo ? await listCodeSystems(repo) : undefined,
    expansion: {
      hierarchical: true,
      paging: true,
      incomplete: false,
      textFilter:
        'Matches codes by prefix, or displays containing every space-separated word (case-insensitive); filters under 3 characters match exact code only.',
    },
    validateCode: { translations: true },
  };
}

async function listCodeSystems(repo: Repository): Promise<TerminologyCapabilitiesCodeSystem[]> {
  const versionsByUri = new Map<string, Set<string>>();
  repo.setMode(DatabaseMode.READER);
  await repo.processAllResources<CodeSystem>(
    {
      resourceType: 'CodeSystem',
      filters: [
        { code: 'status', operator: Operator.NOT, value: 'retired' },
        { code: '_project', operator: Operator.NOT, value: r4ProjectId },
      ],
      sortRules: [{ code: '_lastUpdated' }],
      count: 100,
    },
    async (codeSystem) => {
      if (!codeSystem.url) {
        return;
      }
      let versions = versionsByUri.get(codeSystem.url);
      if (!versions) {
        versions = new Set();
        versionsByUri.set(codeSystem.url, versions);
      }
      if (codeSystem.version) {
        versions.add(codeSystem.version);
      }
    }
  );

  return versionsByUri
    .entries()
    .map(([uri, versions]) => ({
      uri,
      version: versions.size ? [...versions].sort().map((code) => ({ code })) : undefined,
    }))
    .toArray();
}
