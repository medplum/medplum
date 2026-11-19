// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  badRequest,
  deepClone,
  escapeSearchValue,
  evalFhirPath,
  getExtension,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import type { Repository } from '../repo';
import { parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'SDCQuestionnaireAssemble',
  status: 'active',
  kind: 'operation',
  code: 'assemble',
  resource: ['Questionnaire'],
  system: false,
  type: true,
  instance: true,
  parameter: [{ name: 'questionnaire', use: 'in', min: 0, max: '1', type: 'Questionnaire' }],
};

// URIs of referenced SDC extensions
// @see https://build.fhir.org/ig/HL7/sdc/modular.html
export const subQuestionnaireExtension =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-subQuestionnaire';
export const expectationExtension =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-assemble-expectation';
export const assembledFromExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-assembledFrom';
export const variableExtension = 'http://hl7.org/fhir/StructureDefinition/variable';

// Root-level extensions of a subQuestionnaire that its items may depend on, and which are not carried over
const unsupportedModuleExtensions = [
  variableExtension,
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-launchContext',
  'http://hl7.org/fhir/StructureDefinition/cqf-library',
];

export async function assembleHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<{ questionnaire?: Questionnaire }>(operation, req);
  const { repo } = getAuthenticatedContext();

  let questionnaire: Questionnaire;
  if (req.params.id) {
    questionnaire = await repo.readResource('Questionnaire', req.params.id);
  } else if (params.questionnaire) {
    questionnaire = params.questionnaire;
  } else {
    return [badRequest('Questionnaire to assemble must be specified')];
  }

  const canonical = getCanonical(questionnaire);
  const result = deepClone(questionnaire);
  delete result.id;
  delete result.meta;
  result.version = questionnaire.version ? `${questionnaire.version}-assembled` : randomUUID();
  result.extension = (result.extension ?? []).filter((ext) => ext.url !== expectationExtension);
  if (questionnaire.url) {
    result.extension.push({ url: assembledFromExtension, valueCanonical: canonical });
  }
  if (result.item) {
    result.item = await expandItems(repo, result.item, getLinkIdPrefix(result), [canonical]);
  }

  const linkIds = new Set<string>();
  visitItems(result.item ?? [], (item) => {
    if (linkIds.has(item.linkId)) {
      throw new OperationOutcomeError(
        badRequest(`Duplicate linkId '${item.linkId}'; use linkIdPrefix to import a subQuestionnaire more than once`)
      );
    }
    linkIds.add(item.linkId);
  });

  return [allOk, result];
}

async function expandItems(
  repo: Repository,
  items: QuestionnaireItem[],
  prefix: string | undefined,
  stack: string[]
): Promise<QuestionnaireItem[]> {
  const result: QuestionnaireItem[] = [];
  for (const item of items) {
    const canonical = getExtension(item, subQuestionnaireExtension)?.valueCanonical;
    if (canonical) {
      if (item.enableWhen?.length) {
        throw new OperationOutcomeError(
          badRequest(`Item '${item.linkId}': put enableWhen on a group that contains the subQuestionnaire`)
        );
      }
      const subQuestionnaire = await resolveSubQuestionnaire(repo, canonical);
      const key = getCanonical(subQuestionnaire);
      if (stack.includes(key)) {
        throw new OperationOutcomeError(badRequest(`Found circular subQuestionnaire reference to ${canonical}`));
      }
      checkSupported(subQuestionnaire, canonical);
      // Expand nested imports before prefixing, so conditions between nested modules are prefixed consistently
      const subItems = await expandItems(repo, deepClone(subQuestionnaire.item ?? []), undefined, [...stack, key]);
      if (prefix) {
        prefixItems(subItems, prefix);
      }
      result.push(...subItems);
    } else {
      if (item.item) {
        item.item = await expandItems(repo, item.item, getLinkIdPrefix(item) ?? prefix, stack);
      }
      result.push(item);
    }
  }
  return result;
}

async function resolveSubQuestionnaire(repo: Repository, canonical: string): Promise<Questionnaire> {
  const [url, version] = canonical.split('|');
  const filters = [{ code: 'url', operator: Operator.EQUALS, value: escapeSearchValue(url) }];
  if (version) {
    filters.push({ code: 'version', operator: Operator.EQUALS, value: escapeSearchValue(version) });
  }
  const results = await repo.searchResources<Questionnaire>({ resourceType: 'Questionnaire', filters, count: 2 });
  if (results.length === 0) {
    throw new OperationOutcomeError(badRequest(`SubQuestionnaire ${canonical} not found`));
  }
  if (results.length > 1) {
    throw new OperationOutcomeError(badRequest(`Ambiguous subQuestionnaire ${canonical}; specify a version`));
  }
  return results[0];
}

/**
 * Rejects subQuestionnaires with resources or root-level extensions that their items may depend on,
 * since those are not carried over into the assembled Questionnaire.
 * @param subQuestionnaire - The resolved subQuestionnaire.
 * @param canonical - The canonical the subQuestionnaire was imported by.
 */
function checkSupported(subQuestionnaire: Questionnaire, canonical: string): void {
  if (subQuestionnaire.contained?.length) {
    throw new OperationOutcomeError(
      badRequest(`SubQuestionnaire ${canonical} has contained resources, which are not supported`)
    );
  }
  const extension = subQuestionnaire.extension?.find((ext) => unsupportedModuleExtensions.includes(ext.url));
  if (extension) {
    throw new OperationOutcomeError(
      badRequest(`SubQuestionnaire ${canonical} has extension ${extension.url}, which is not supported`)
    );
  }
}

/**
 * Prefixes the linkIds of a subQuestionnaire's items, and the enableWhen conditions that refer to them.
 * Conditions on questions outside the subQuestionnaire are left unchanged.
 * @param items - The subQuestionnaire's items, modified in place.
 * @param prefix - The linkIdPrefix in scope where the subQuestionnaire is imported.
 */
function prefixItems(items: QuestionnaireItem[], prefix: string): void {
  const linkIds = new Set<string>();
  visitItems(items, (item) => linkIds.add(item.linkId));
  visitItems(items, (item) => {
    item.linkId = prefix + item.linkId;
    for (const condition of item.enableWhen ?? []) {
      if (linkIds.has(condition.question)) {
        condition.question = prefix + condition.question;
      }
    }
  });
}

function visitItems(items: QuestionnaireItem[], visit: (item: QuestionnaireItem) => void): void {
  for (const item of items) {
    visit(item);
    visitItems(item.item ?? [], visit);
  }
}

function getLinkIdPrefix(container: Questionnaire | QuestionnaireItem): string | undefined {
  const variable = container.extension?.find(
    (ext) => ext.url === variableExtension && ext.valueExpression?.name === 'linkIdPrefix'
  )?.valueExpression;
  if (!variable?.expression) {
    return undefined;
  }
  let value: unknown;
  try {
    value = variable.language === 'text/fhirpath' ? evalFhirPath(variable.expression, {})[0] : undefined;
  } catch {
    value = undefined;
  }
  if (typeof value !== 'string') {
    throw new OperationOutcomeError(
      badRequest(`linkIdPrefix must be a FHIRPath expression that evaluates to a string: ${variable.expression}`)
    );
  }
  return value;
}

function getCanonical(questionnaire: Questionnaire): string {
  return questionnaire.version ? `${questionnaire.url}|${questionnaire.version}` : `${questionnaire.url}`;
}
