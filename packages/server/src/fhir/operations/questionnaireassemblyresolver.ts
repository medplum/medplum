// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, escapeSearchValue, isResource, OperationOutcomeError, Operator } from '@medplum/core';
import type { FhirRepository } from '@medplum/fhir-router';
import type { OperationOutcomeIssue, Questionnaire, Reference } from '@medplum/fhirtypes';
import { parseQuestionnaireCanonical } from './utils/questionnaire';

export const KNOWLEDGE_CAPABILITY_URL = 'http://hl7.org/fhir/StructureDefinition/cqf-knowledgeCapability';
export type QuestionnaireInput = Questionnaire | Reference<Questionnaire> | string;

/** Request-local resolution. Every lookup uses the caller's repository and access policy. */
export class QuestionnaireResolver {
  readonly issues: OperationOutcomeIssue[] = [];
  private readonly cache = new Map<string, Promise<Questionnaire>>();

  private readonly repo: FhirRepository;

  constructor(repo: FhirRepository) {
    this.repo = repo;
  }

  async resolve(input: QuestionnaireInput): Promise<Questionnaire> {
    if (isResource<Questionnaire>(input, 'Questionnaire')) {
      return input;
    }
    const key = typeof input === 'string' ? `canonical:${input}` : `reference:${input.reference}`;
    let result = this.cache.get(key);
    if (!result) {
      result = typeof input === 'string' ? this.resolveCanonical(input) : this.resolveReference(input);
      this.cache.set(key, result);
    }
    return result;
  }

  private async resolveReference(input: Reference<Questionnaire>): Promise<Questionnaire> {
    const match = /^Questionnaire\/([A-Za-z0-9.-]{1,64})$/.exec(input.reference ?? '');
    if (!match) {
      throw new OperationOutcomeError(
        badRequest('Expected a local Questionnaire/id reference; remote and history references are unsupported')
      );
    }
    return this.repo.readResource<Questionnaire>('Questionnaire', match[1]);
  }

  private async resolveCanonical(canonical: string): Promise<Questionnaire> {
    const { url, version } = parseQuestionnaireCanonical(canonical);
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(url)) {
      throw new OperationOutcomeError(
        badRequest('Expected an absolute canonical URL; use valueReference for Questionnaire/id')
      );
    }
    const filters = [{ code: 'url', operator: Operator.EQUALS, value: escapeSearchValue(url) }];
    if (version !== undefined) {
      filters.push({ code: 'version', operator: Operator.EQUALS, value: escapeSearchValue(version) });
    }
    // Search every page before selecting a source. Never infer business-version order from strings.
    const matches: Questionnaire[] = [];
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const page = await this.repo.searchResources<Questionnaire>({
        resourceType: 'Questionnaire',
        filters,
        count: pageSize,
        offset,
        sortRules: [{ code: '_id' }],
      });
      matches.push(...page);
      if (page.length < pageSize) {
        break;
      }
      if (matches.length >= 1000) {
        throw new OperationOutcomeError(
          badRequest(`Too many matching Questionnaires for ${canonical}; use an explicit resource reference`)
        );
      }
    }
    if (matches.length === 0) {
      throw new OperationOutcomeError(badRequest(`Questionnaire with canonical ${canonical} not found`));
    }
    if (new Set(matches.map((q) => q.version)).size > 1) {
      throw new OperationOutcomeError(badRequest(`Ambiguous Questionnaire ${canonical}; specify a business version`));
    }
    const sources = matches.filter((q) => {
      const codes = q.extension?.filter((e) => e.url === KNOWLEDGE_CAPABILITY_URL).map((e) => e.valueCode) ?? [];
      return codes.includes('computable') && !codes.includes('executable');
    });
    const candidates = matches.length === 1 ? matches : sources;
    const selected = candidates.length === 1 ? candidates[0] : undefined;
    if (!selected) {
      throw new OperationOutcomeError(
        badRequest(`Ambiguous Questionnaire ${canonical}; supply an explicit resource reference`)
      );
    }
    if (version === undefined) {
      this.issues.push({
        severity: 'warning',
        code: 'business-rule',
        details: { text: `Unversioned canonical ${url}; pin a business version for reproducible assembly` },
      });
    }
    return selected;
  }
}
