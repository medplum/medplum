// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  allOk,
  badRequest,
  deepClone,
  deepEquals,
  evalFhirPathTyped,
  getElementDefinitionForPath,
  isReference,
  isResource,
  OperationOutcomeError,
  Operator,
  toTypedValue,
} from '@medplum/core';
import type { FhirRepository, FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  ElementDefinition,
  Extension,
  OperationDefinition,
  OperationOutcome,
  OperationOutcomeIssue,
  Parameters,
  ParametersParameter,
  Questionnaire,
  QuestionnaireItem,
  Reference,
  Resource,
  StructureDefinition,
} from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import { makeOperationDefinition } from './definitions';

export const SUB_QUESTIONNAIRE_EXTENSION_URL =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-subQuestionnaire';
export const ASSEMBLE_EXPECTATION_EXTENSION_URL =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-assemble-expectation';
export const ASSEMBLED_FROM_EXTENSION_URL =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-assembledFrom';
export const VARIABLE_EXTENSION_URL = 'http://hl7.org/fhir/StructureDefinition/variable';

const LINK_ID_PREFIX_VARIABLE = 'linkIdPrefix';
const CQF_LIBRARY_EXTENSION_URL = 'http://hl7.org/fhir/StructureDefinition/cqf-library';
const LAUNCH_CONTEXT_EXTENSION_URL = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-launchContext';
const TARGET_CONSTRAINT_EXTENSION_URL = 'http://hl7.org/fhir/StructureDefinition/targetConstraint';
const QUESTIONNAIRE_CONSTRAINT_EXTENSION_URL = 'http://hl7.org/fhir/StructureDefinition/questionnaire-constraint';
const ITEM_POPULATION_CONTEXT_EXTENSION_URL =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-itemPopulationContext';
const ITEM_EXTRACTION_CONTEXT_EXTENSION_URL =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-itemExtractionContext';
const QUESTIONNAIRE_ADAPTIVE_EXTENSION_URL =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-questionnaireAdaptive';
const ASSEMBLE_CONTEXT_EXTENSION_URL =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-assembleContext';
const ANSWER_EXPRESSION_EXTENSION_URL =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-answerExpression';
const SDC_MODULAR_PROFILE_URL = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-modular';
const CONTAINED_REFERENCE_KEYS = new Set([
  'reference',
  'valueCanonical',
  'valueUri',
  'valueUrl',
  'answerValueSet',
  'definition',
]);
const FORBIDDEN_CHILD_ROOT_EXTENSIONS = new Set([
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-definitionExtract',
  ITEM_POPULATION_CONTEXT_EXTENSION_URL,
  ITEM_EXTRACTION_CONTEXT_EXTENSION_URL,
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-observationExtract',
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-observation-extract-category',
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-observationLinkPeriod',
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-preferredTerminologyServer',
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract',
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext',
]);

/**
 * SDC's Questionnaire/$assemble operation.
 *
 * The input is deliberately described as Resource because SDC allows a
 * canonical URI, a Reference, or an inline Questionnaire for the same
 * parameter. The request parser below enforces those three choices.
 */
export const questionnaireAssembleOperation: OperationDefinition = makeOperationDefinition(
  { scope: 'type-and-instance', resource: 'Questionnaire' },
  {
    id: 'Questionnaire-assemble',
    name: 'SDCAssemble',
    code: 'assemble',
    url: 'http://hl7.org/fhir/uv/sdc/OperationDefinition/Questionnaire-assemble',
    version: '4.0.0',
    title: 'Assemble Modular Questionnaire Operation',
    inputProfile: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/parameters-questionnaire-assemble-in',
    description:
      'Takes a modular Questionnaire and produces an equivalent fully-inline Questionnaire by resolving subQuestionnaire references and item definitions.',
    parameter: [
      {
        use: 'in',
        name: 'questionnaire',
        type: 'Element',
        min: 1,
        max: '1',
        extension: [
          { url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type', valueUri: 'uri' },
          { url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type', valueUri: 'Reference' },
          {
            url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
            valueUri: 'Questionnaire',
          },
        ],
        documentation: 'The modular Questionnaire to assemble.',
      },
      {
        use: 'out',
        name: 'return',
        type: 'Resource',
        min: 0,
        max: '1',
        documentation: 'The fully assembled Questionnaire.',
      },
      {
        use: 'out',
        name: 'outcome',
        type: 'Resource',
        min: 0,
        max: '1',
        documentation: 'Warnings or informational messages produced during assembly.',
      },
    ],
  }
);

export type QuestionnaireInput = Questionnaire | Reference<Questionnaire> | string;

export type AssemblyResult = {
  questionnaire: Questionnaire;
  issues: OperationOutcomeIssue[];
};

type ResolvedQuestionnaire = {
  questionnaire: Questionnaire;
  canonical: string;
  fragment?: string;
};

type AssemblyState = {
  readonly repo: FhirRepository;
  readonly issues: OperationOutcomeIssue[];
  readonly structureDefinitions: StructureDefinition[];
  readonly rootQuestionnaire: Questionnaire;
  readonly assembledFrom: string[];
  readonly containedResources: Resource[];
  readonly containedById: Map<string, Resource>;
  readonly containedResourceKeys: Set<string>;
};

type ElementMetadata = Pick<ElementDefinition, 'code' | 'short' | 'min' | 'max' | 'maxLength' | 'binding' | 'type'>;

/**
 * Parses the supported Questionnaire input shapes from a FHIR operation
 * request. Keeping this separate makes the union input behavior testable and
 * avoids changing the generic operation parameter parser for every operation.
 * @param req - The FHIR operation request.
 * @returns The inline Questionnaire, canonical URI, or Reference input.
 */
export function parseQuestionnaireInput(req: FhirRequest): QuestionnaireInput | undefined {
  const body = req.body;

  if (isResource<Questionnaire>(body, 'Questionnaire')) {
    return body;
  }

  if (isResource<Parameters>(body, 'Parameters')) {
    const parameters = body.parameter?.filter((p) => p.name === 'questionnaire') ?? [];
    if (parameters.length > 1) {
      throw new OperationOutcomeError(badRequest('Questionnaire input parameter must not repeat'));
    }
    return parameters.length === 1 ? getParameterValue(parameters[0]) : undefined;
  }

  // Preserve the server's plain JSON operation compatibility for clients that
  // send { questionnaire: ... } instead of a Parameters resource.
  if (body && typeof body === 'object' && 'questionnaire' in body) {
    const value = body.questionnaire;
    if (
      isResource<Questionnaire>(value, 'Questionnaire') ||
      isReference<Questionnaire>(value) ||
      typeof value === 'string'
    ) {
      return value;
    }
  }

  return undefined;
}

function getParameterValue(parameter: ParametersParameter): QuestionnaireInput | undefined {
  if (isResource<Questionnaire>(parameter.resource, 'Questionnaire')) {
    return parameter.resource;
  }
  if (parameter.valueReference) {
    return parameter.valueReference as Reference<Questionnaire>;
  }
  return parameter.valueCanonical ?? parameter.valueUri;
}

/**
 * Assembles a modular Questionnaire without modifying the caller's resource.
 * The returned warnings follow the SDC operation's optional outcome behavior.
 * @param repo - Repository used to resolve referenced Questionnaires and definitions.
 * @param input - The modular Questionnaire to assemble.
 * @returns The assembled Questionnaire and any non-fatal outcome issues.
 */
export async function assembleQuestionnaire(repo: FhirRepository, input: Questionnaire): Promise<AssemblyResult> {
  const result = deepClone(input);
  const state: AssemblyState = {
    repo,
    issues: [],
    structureDefinitions: getContainedStructureDefinitions(result),
    rootQuestionnaire: result,
    assembledFrom: [],
    containedResources: [...(result.contained ?? [])],
    containedById: new Map(
      (result.contained ?? []).flatMap((resource) => (resource.id ? [[resource.id, resource] as const] : []))
    ),
    containedResourceKeys: new Set(),
  };
  const rootKey = getQuestionnaireKey(result);
  const rootPrefix = getLinkIdPrefix(result);
  if (result.item) {
    result.item = await assembleItems(result.item, state, new Set([rootKey]), rootPrefix, false, result);
  }

  await propagateDefinitionMetadata(result.item ?? [], state);
  assertUniqueLinkIds(result.item ?? []);
  finalizeAssembledQuestionnaire(result, state);

  return { questionnaire: result, issues: state.issues };
}

export async function questionnaireAssembleHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();

  let questionnaire: Questionnaire;
  if (req.params.id) {
    questionnaire = await repo.readResource<Questionnaire>('Questionnaire', req.params.id);
  } else {
    const input = parseQuestionnaireInput(req);
    if (!input) {
      return [badRequest('Questionnaire to assemble must be specified')];
    }
    const resolved = await resolveQuestionnaire(repo, input);
    if (!resolved) {
      return [badRequest('Questionnaire input could not be resolved')];
    }
    questionnaire = resolved.questionnaire;
  }

  const result = await assembleQuestionnaire(repo, questionnaire);
  if (result.issues.length === 0) {
    return [allOk, result.questionnaire];
  }

  const outcome: OperationOutcome = {
    resourceType: 'OperationOutcome',
    issue: result.issues,
  };
  const response: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'return', resource: result.questionnaire },
      { name: 'outcome', resource: outcome },
    ],
  };
  return [allOk, response];
}

async function assembleItems(
  items: QuestionnaireItem[],
  state: AssemblyState,
  stack: Set<string>,
  inheritedPrefix: string | undefined,
  prefixItems: boolean,
  parent: Questionnaire | QuestionnaireItem
): Promise<QuestionnaireItem[]> {
  const result: QuestionnaireItem[] = [];

  for (const sourceItem of items) {
    const itemPrefix = getLinkIdPrefix(sourceItem, inheritedPrefix);
    const subQuestionnaireExtensions =
      sourceItem.extension?.filter((e) => e.url === SUB_QUESTIONNAIRE_EXTENSION_URL) ?? [];

    if (subQuestionnaireExtensions.length > 1) {
      throw new OperationOutcomeError(
        badRequest('A Questionnaire item may reference only one subQuestionnaire', 'Questionnaire.item.extension')
      );
    }

    if (subQuestionnaireExtensions.length === 1) {
      const canonical = getExtensionCanonical(subQuestionnaireExtensions[0]);
      if (!canonical) {
        throw new OperationOutcomeError(
          badRequest('subQuestionnaire extension must contain a canonical value', 'Questionnaire.item.extension')
        );
      }

      const resolved = await resolveQuestionnaire(state.repo, canonical);
      if (!resolved) {
        throw new OperationOutcomeError(
          badRequest(`Questionnaire with canonical ${canonical} not found`, 'Questionnaire.item.extension')
        );
      }

      const childKey = getQuestionnaireKey(
        resolved.questionnaire,
        getResolvedCanonical(resolved) ?? resolved.canonical
      );
      if (stack.has(childKey)) {
        throw new OperationOutcomeError(
          badRequest(`Circular subQuestionnaire reference detected for ${canonical}`, 'Questionnaire.item.extension')
        );
      }

      validateSubQuestionnaire(state.rootQuestionnaire, resolved.questionnaire, canonical);
      state.structureDefinitions.push(...getContainedStructureDefinitions(resolved.questionnaire));
      const childCanonical = getResolvedCanonical(resolved);
      if (childCanonical && childCanonical !== getQuestionnaireCanonical(state.rootQuestionnaire)) {
        addAssembledFrom(state, childCanonical);
      }
      const childPrefix = getLinkIdPrefix(resolved.questionnaire, itemPrefix);
      registerContainedResources(state, resolved.questionnaire, childPrefix, childKey);
      propagateSubQuestionnaireExtensions(state, parent, resolved.questionnaire, childPrefix);
      const childItem = resolved.fragment
        ? findQuestionnaireItem(resolved.questionnaire.item ?? [], resolved.fragment)
        : undefined;
      if (resolved.fragment && !childItem) {
        throw new OperationOutcomeError(
          badRequest(
            `Questionnaire item ${resolved.fragment} not found in ${canonical}`,
            'Questionnaire.item.extension'
          )
        );
      }

      const childItems = resolved.fragment ? [childItem as QuestionnaireItem] : (resolved.questionnaire.item ?? []);
      const assembledChildItems = await assembleItems(
        childItems,
        state,
        new Set([...stack, childKey]),
        childPrefix,
        true,
        parent
      );
      result.push(...assembledChildItems);
      continue;
    }

    const item = deepClone(sourceItem);
    if (prefixItems && inheritedPrefix) {
      applyLinkIdPrefix(item, inheritedPrefix);
      rewriteQuestionnaireItemReferences(item, inheritedPrefix);
    }
    if (sourceItem.item) {
      item.item = await assembleItems(sourceItem.item, state, stack, itemPrefix, prefixItems, item);
    }
    result.push(item);
  }

  return result;
}

function validateSubQuestionnaire(parent: Questionnaire, child: Questionnaire, canonical: string): void {
  if (child.implicitRules && child.implicitRules !== parent.implicitRules) {
    throw new OperationOutcomeError(
      badRequest(
        `SubQuestionnaire ${canonical} has different implicitRules from its parent`,
        'Questionnaire.implicitRules'
      )
    );
  }
  if (child.modifierExtension?.length) {
    throw new OperationOutcomeError(
      badRequest(`SubQuestionnaire ${canonical} must not contain modifierExtension`, 'Questionnaire.item.extension')
    );
  }
  if (
    child.meta?.security?.some(
      (security) => !parent.meta?.security?.some((parentSecurity) => deepEquals(parentSecurity, security))
    )
  ) {
    throw new OperationOutcomeError(
      badRequest(
        `SubQuestionnaire ${canonical} has security labels not present on its parent`,
        'Questionnaire.meta.security'
      )
    );
  }
  if (child.extension?.some((extension) => extension.url === QUESTIONNAIRE_ADAPTIVE_EXTENSION_URL)) {
    throw new OperationOutcomeError(
      badRequest(`SubQuestionnaire ${canonical} must not be adaptive`, 'Questionnaire.item.extension')
    );
  }
  if (child.language && child.language !== parent.language) {
    throw new OperationOutcomeError(
      badRequest(`SubQuestionnaire ${canonical} has a different language from its parent`, 'Questionnaire.language')
    );
  }
}

function getResolvedCanonical(resolved: ResolvedQuestionnaire): string | undefined {
  if (resolved.questionnaire.url) {
    return getQuestionnaireCanonical(resolved.questionnaire);
  }
  const parsed = parseCanonical(resolved.canonical);
  if (!parsed.url) {
    return undefined;
  }
  return parsed.version ? `${parsed.url}|${parsed.version}` : parsed.url;
}

function addAssembledFrom(state: AssemblyState, canonical: string): void {
  if (!state.assembledFrom.includes(canonical)) {
    state.assembledFrom.push(canonical);
  }
}

function registerContainedResources(
  state: AssemblyState,
  questionnaire: Questionnaire,
  prefix: string | undefined,
  sourceKey: string
): void {
  for (const [index, resource] of (questionnaire.contained ?? []).entries()) {
    const sourceResourceKey = `${sourceKey}|${prefix ?? ''}|${resource.id ?? index}`;
    if (state.containedResourceKeys.has(sourceResourceKey)) {
      continue;
    }
    state.containedResourceKeys.add(sourceResourceKey);

    const copy = deepClone(resource);
    if (prefix && copy.id) {
      copy.id = prefix + copy.id;
      rewriteContainedReferences(copy, prefix);
    }

    const existing = copy.id ? state.containedById.get(copy.id) : undefined;
    if (existing) {
      if (!deepEquals(existing, copy)) {
        throw new OperationOutcomeError(
          badRequest(`Contained resource id '${copy.id}' is used by different resources`, 'Questionnaire.contained')
        );
      }
      continue;
    }

    state.containedResources.push(copy);
    if (copy.id) {
      state.containedById.set(copy.id, copy);
    }
  }
}

function rewriteContainedReferences(value: unknown, prefix: string): void {
  if (Array.isArray(value)) {
    for (const element of value) {
      rewriteContainedReferences(element, prefix);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (CONTAINED_REFERENCE_KEYS.has(key) && typeof nested === 'string' && nested.startsWith('#')) {
      (value as Record<string, unknown>)[key] = `#${prefix}${nested.slice(1)}`;
    } else {
      rewriteContainedReferences(nested, prefix);
    }
  }
}

function rewriteQuestionnaireItemReferences(item: QuestionnaireItem, prefix: string): void {
  for (const [key, value] of Object.entries(item)) {
    if (key !== 'item') {
      if (CONTAINED_REFERENCE_KEYS.has(key) && typeof value === 'string' && value.startsWith('#')) {
        (item as unknown as Record<string, unknown>)[key] = `#${prefix}${value.slice(1)}`;
      } else {
        rewriteContainedReferences(value, prefix);
      }
    }
  }
}

function propagateSubQuestionnaireExtensions(
  state: AssemblyState,
  parent: Questionnaire | QuestionnaireItem,
  child: Questionnaire,
  childPrefix: string | undefined
): void {
  for (const extension of child.extension ?? []) {
    if (FORBIDDEN_CHILD_ROOT_EXTENSIONS.has(extension.url)) {
      throw new OperationOutcomeError(
        badRequest(`Extension ${extension.url} is not allowed on a subQuestionnaire root`, 'Questionnaire.extension')
      );
    }

    const propagatedExtension = deepClone(extension);
    if (childPrefix) {
      rewriteContainedReferences(propagatedExtension, childPrefix);
    }

    switch (extension.url) {
      case CQF_LIBRARY_EXTENSION_URL:
        addUniqueRootExtension(
          state.rootQuestionnaire,
          propagatedExtension,
          (candidate) => candidate.url === CQF_LIBRARY_EXTENSION_URL
        );
        break;
      case LAUNCH_CONTEXT_EXTENSION_URL:
        addUniqueRootExtension(
          state.rootQuestionnaire,
          propagatedExtension,
          (candidate) =>
            candidate.url === LAUNCH_CONTEXT_EXTENSION_URL &&
            getLaunchContextName(candidate) === getLaunchContextName(extension)
        );
        break;
      case TARGET_CONSTRAINT_EXTENSION_URL:
      case QUESTIONNAIRE_CONSTRAINT_EXTENSION_URL:
      case VARIABLE_EXTENSION_URL:
        addUniqueContainerExtension(parent, propagatedExtension);
        break;
      case ASSEMBLE_CONTEXT_EXTENSION_URL:
      case ASSEMBLE_EXPECTATION_EXTENSION_URL:
        break;
      default:
        break;
    }
  }
}

function addUniqueRootExtension(
  questionnaire: Questionnaire,
  extension: Extension,
  isDuplicate: (candidate: Extension) => boolean
): void {
  const extensions = questionnaire.extension ?? [];
  if (!extensions.some(isDuplicate)) {
    extensions.push(deepClone(extension));
    questionnaire.extension = extensions;
  }
}

function addUniqueContainerExtension(container: Questionnaire | QuestionnaireItem, extension: Extension): void {
  const extensions = container.extension ?? [];
  if (extension.url === VARIABLE_EXTENSION_URL) {
    const name = extension.valueExpression?.name;
    if (name) {
      const duplicate = extensions.find(
        (candidate) => candidate.url === VARIABLE_EXTENSION_URL && candidate.valueExpression?.name === name
      );
      if (duplicate) {
        if (!deepEquals(duplicate, extension)) {
          throw new OperationOutcomeError(badRequest(`Variable '${name}' is duplicated`, 'Questionnaire.extension'));
        }
        return;
      }
    }
  }
  if (!extensions.some((candidate) => deepEquals(candidate, extension))) {
    extensions.push(deepClone(extension));
    container.extension = extensions;
  }
}

function getLaunchContextName(extension: Extension): string | undefined {
  return extension.extension?.find((nested) => nested.url === 'name')?.valueCoding?.code;
}

async function resolveQuestionnaire(
  repo: FhirRepository,
  input: QuestionnaireInput
): Promise<ResolvedQuestionnaire | undefined> {
  if (isResource<Questionnaire>(input, 'Questionnaire')) {
    return {
      questionnaire: input,
      canonical: getQuestionnaireCanonical(input) ?? getQuestionnaireKey(input),
    };
  }

  if (isReference<Questionnaire>(input)) {
    if (input.resource && isResource<Questionnaire>(input.resource, 'Questionnaire')) {
      return {
        questionnaire: input.resource,
        canonical: getQuestionnaireCanonical(input.resource) ?? input.reference,
      };
    }
    if (!input.reference) {
      return undefined;
    }
    const reference = input.reference;
    const resource = await readQuestionnaireReference(repo, reference);
    if (resource) {
      return {
        questionnaire: resource,
        canonical: getQuestionnaireCanonical(resource) ?? reference,
      };
    }
    return resolveQuestionnaireCanonical(repo, reference);
  }

  return typeof input === 'string' ? resolveQuestionnaireCanonical(repo, input) : undefined;
}

async function resolveQuestionnaireCanonical(
  repo: FhirRepository,
  canonical: string
): Promise<ResolvedQuestionnaire | undefined> {
  const parsed = parseCanonical(canonical);
  if (!parsed.url) {
    return undefined;
  }

  const resourceReference = parseQuestionnaireReference(parsed.url);
  if (resourceReference) {
    const resource = await readQuestionnaireReference(repo, parsed.url);
    if (resource) {
      return { questionnaire: resource, canonical, fragment: parsed.fragment };
    }
  }

  const questionnaireFilter = { code: 'url', operator: Operator.EQUALS, value: parsed.url };
  const questionnaireResults = await repo.searchResources<Questionnaire>({
    resourceType: 'Questionnaire',
    filters: [questionnaireFilter],
    sortRules: [{ code: 'version', descending: true }],
  });
  const questionnaire = parsed.version
    ? questionnaireResults.find((candidate) => candidate.version === parsed.version)
    : questionnaireResults[0];
  return questionnaire ? { questionnaire, canonical, fragment: parsed.fragment } : undefined;
}

async function readQuestionnaireReference(repo: FhirRepository, reference: string): Promise<Questionnaire | undefined> {
  const parsed = parseQuestionnaireReference(reference);
  if (!parsed) {
    return undefined;
  }

  try {
    return await repo.readResource<Questionnaire>('Questionnaire', parsed.id);
  } catch {
    return undefined;
  }
}

function parseQuestionnaireReference(reference: string): { id: string } | undefined {
  const match = /(?:^|\/)Questionnaire\/([^/?#]+)(?:\/_history\/[^/?#]+)?$/.exec(reference);
  return match ? { id: decodeURIComponent(match[1]) } : undefined;
}

function parseCanonical(canonical: string): { url: string; version?: string; fragment?: string } {
  const hashIndex = canonical.indexOf('#');
  const withoutFragment = hashIndex >= 0 ? canonical.slice(0, hashIndex) : canonical;
  const fragment = hashIndex >= 0 ? canonical.slice(hashIndex + 1) : undefined;
  const pipeIndex = withoutFragment.indexOf('|');
  if (pipeIndex < 0) {
    return { url: withoutFragment, fragment };
  }
  return {
    url: withoutFragment.slice(0, pipeIndex),
    version: withoutFragment.slice(pipeIndex + 1),
    fragment,
  };
}

function getExtensionCanonical(extension: Extension): string | undefined {
  return extension.valueCanonical ?? extension.valueUri ?? extension.valueUrl;
}

function getQuestionnaireCanonical(questionnaire: Questionnaire): string | undefined {
  if (!questionnaire.url) {
    return undefined;
  }
  return questionnaire.version ? `${questionnaire.url}|${questionnaire.version}` : questionnaire.url;
}

function getQuestionnaireKey(questionnaire: Questionnaire, fallback?: string): string {
  return (
    getQuestionnaireCanonical(questionnaire) ??
    (questionnaire.id ? `Questionnaire/${questionnaire.id}` : (fallback ?? 'root'))
  );
}

function getContainedStructureDefinitions(questionnaire: Questionnaire): StructureDefinition[] {
  return (questionnaire.contained ?? []).filter((resource): resource is StructureDefinition =>
    isResource<StructureDefinition>(resource, 'StructureDefinition')
  );
}

function getLinkIdPrefix(element: Questionnaire | QuestionnaireItem, inherited?: string): string | undefined {
  const variable = element.extension?.find(
    (e) => e.url === VARIABLE_EXTENSION_URL && e.valueExpression?.name === LINK_ID_PREFIX_VARIABLE
  );
  const expression = variable?.valueExpression?.expression;
  if (!expression) {
    return inherited;
  }

  try {
    const result = evalFhirPathTyped(
      expression,
      [toTypedValue(element)],
      inherited ? { '%linkIdPrefix': toTypedValue(inherited) } : {}
    )[0]?.value;
    return typeof result === 'string' ? result : inherited;
  } catch {
    return inherited;
  }
}

function applyLinkIdPrefix(item: QuestionnaireItem, prefix: string): void {
  item.linkId = prefix + item.linkId;
  for (const enableWhen of item.enableWhen ?? []) {
    enableWhen.question = prefix + enableWhen.question;
  }
}

function findQuestionnaireItem(items: QuestionnaireItem[], linkId: string): QuestionnaireItem | undefined {
  for (const item of items) {
    if (item.linkId === linkId) {
      return item;
    }
    const nested = findQuestionnaireItem(item.item ?? [], linkId);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

async function propagateDefinitionMetadata(items: QuestionnaireItem[], state: AssemblyState): Promise<void> {
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const expression = `Questionnaire.item[${index}].definition`;
    if (item.definition) {
      const element = await resolveElementDefinition(state, item.definition);
      if (element) {
        applyElementMetadata(item, element);
      } else {
        const questionnaireItem = await resolveQuestionnaireItemDefinition(state, item.definition);
        if (questionnaireItem) {
          applyQuestionnaireItemMetadata(item, questionnaireItem);
        } else if (canWarnForUnresolvedDefinition(item)) {
          state.issues.push({
            severity: 'warning',
            code: 'processing',
            details: {
              text: `Unable to resolve element definition ${item.definition} when assembling Questionnaire item ${item.linkId}`,
            },
            expression: [expression],
          });
        } else {
          throw new OperationOutcomeError(
            badRequest(`Unable to resolve required element definition ${item.definition}`, expression)
          );
        }
      }
    }
    if (item.item) {
      await propagateDefinitionMetadata(item.item, state);
    }
  }
}

async function resolveElementDefinition(
  state: AssemblyState,
  definition: string
): Promise<ElementMetadata | undefined> {
  const parsed = parseCanonical(definition);
  if (!parsed.url || !parsed.fragment) {
    return undefined;
  }

  const contained = state.structureDefinitions.find(
    (sd) => sd.url === parsed.url && (!parsed.version || sd.version === parsed.version)
  );
  const structureDefinition = contained ?? (await findStructureDefinition(state.repo, parsed.url, parsed.version));

  const definedElement = [
    ...(structureDefinition?.snapshot?.element ?? []),
    ...(structureDefinition?.differential?.element ?? []),
  ].find((element) => element.id === parsed.fragment || element.path === parsed.fragment);
  if (definedElement) {
    return definedElement;
  }

  // Base FHIR definitions are already indexed by Medplum. This fallback
  // covers references such as StructureDefinition/Patient#Patient.name even
  // when the full StructureDefinition resource is not stored in the project.
  const baseUrl = 'http://hl7.org/fhir/StructureDefinition/';
  if (parsed.url.startsWith(baseUrl)) {
    const resourceType = parsed.url.slice(baseUrl.length);
    const path = parsed.fragment.startsWith(resourceType + '.')
      ? parsed.fragment.slice(resourceType.length + 1)
      : parsed.fragment;
    const baseElement = getElementDefinitionForPath(resourceType, path);
    if (baseElement) {
      return {
        short: baseElement.description,
        min: baseElement.min,
        max: String(baseElement.max),
        type: baseElement.type.map((type) => ({ code: type.code })),
      };
    }
  }

  return undefined;
}

async function resolveQuestionnaireItemDefinition(
  state: AssemblyState,
  definition: string
): Promise<QuestionnaireItem | undefined> {
  const parsed = parseCanonical(definition);
  if (!parsed.url || !parsed.fragment) {
    return undefined;
  }
  const resolved = await resolveQuestionnaireCanonical(state.repo, definition);
  return resolved?.fragment ? findQuestionnaireItem(resolved.questionnaire.item ?? [], resolved.fragment) : undefined;
}

async function findStructureDefinition(
  repo: FhirRepository,
  url: string,
  version: string | undefined
): Promise<StructureDefinition | undefined> {
  const results = await repo.searchResources<StructureDefinition>({
    resourceType: 'StructureDefinition',
    filters: [{ code: 'url', operator: Operator.EQUALS, value: url }],
    sortRules: [{ code: 'version', descending: true }],
  });
  return version ? results.find((candidate) => candidate.version === version) : results[0];
}

function applyElementMetadata(item: QuestionnaireItem, element: ElementMetadata): void {
  if (!item.code && element.code) {
    item.code = deepClone(element.code);
  }
  if (!item.text && element.short) {
    item.text = element.short;
  }
  if (!item.type) {
    const type = getQuestionnaireItemType(element);
    if (type) {
      item.type = type;
    }
  }
  if (item.required === undefined && element.min !== undefined) {
    item.required = element.min > 0;
  }
  if (item.repeats === undefined && element.max !== undefined) {
    item.repeats = element.max !== '1';
  }
  if (item.maxLength === undefined && element.maxLength !== undefined) {
    item.maxLength = element.maxLength;
  }
  if (!item.answerValueSet && element.binding?.valueSet) {
    item.answerValueSet = element.binding.valueSet;
  }
}

function applyQuestionnaireItemMetadata(item: QuestionnaireItem, source: QuestionnaireItem): void {
  if (!item.code && source.code) {
    item.code = deepClone(source.code);
  }
  if (!item.text && source.text) {
    item.text = source.text;
  }
  if (!item.type && source.type) {
    item.type = source.type;
  }
  if (item.enableWhen === undefined && source.enableWhen) {
    item.enableWhen = deepClone(source.enableWhen);
  }
  if (item.enableBehavior === undefined && source.enableBehavior) {
    item.enableBehavior = source.enableBehavior;
  }
  if (item.required === undefined && source.required !== undefined) {
    item.required = source.required;
  }
  if (item.repeats === undefined && source.repeats !== undefined) {
    item.repeats = source.repeats;
  }
  if (item.readOnly === undefined && source.readOnly !== undefined) {
    item.readOnly = source.readOnly;
  }
  if (item.maxLength === undefined && source.maxLength !== undefined) {
    item.maxLength = source.maxLength;
  }
  if (!item.answerValueSet && source.answerValueSet) {
    item.answerValueSet = source.answerValueSet;
  }
  if (!item.answerOption && source.answerOption) {
    item.answerOption = deepClone(source.answerOption);
  }
  if (!item.initial && source.initial) {
    item.initial = deepClone(source.initial);
  }
  if (!item.item && source.item) {
    item.item = deepClone(source.item);
  }

  for (const extension of source.extension ?? []) {
    const duplicate = item.extension?.some(
      (candidate) =>
        candidate.url === extension.url &&
        (extension.valueExpression?.name === undefined ||
          candidate.valueExpression?.name === extension.valueExpression.name)
    );
    if (!duplicate) {
      item.extension = [...(item.extension ?? []), deepClone(extension)];
    }
  }
}

function getQuestionnaireItemType(element: ElementMetadata): QuestionnaireItem['type'] | undefined {
  const code = element.type?.[0]?.code?.split('/').pop()?.toLowerCase();
  switch (code) {
    case 'boolean':
      return 'boolean';
    case 'decimal':
      return 'decimal';
    case 'integer':
    case 'positiveint':
    case 'unsignedint':
      return 'integer';
    case 'date':
      return 'date';
    case 'datetime':
    case 'instant':
      return 'dateTime';
    case 'time':
      return 'time';
    case 'string':
    case 'id':
    case 'oid':
      return 'string';
    case 'uri':
    case 'url':
      return 'url';
    case 'markdown':
    case 'xhtml':
      return 'text';
    case 'coding':
    case 'code':
    case 'codeableconcept':
      return 'choice';
    case 'attachment':
      return 'attachment';
    case 'reference':
      return 'reference';
    case 'quantity':
      return 'quantity';
    case 'backboneelement':
    case 'element':
      return 'group';
    default:
      return undefined;
  }
}

function canWarnForUnresolvedDefinition(item: QuestionnaireItem): boolean {
  if (!item.text) {
    return false;
  }
  if (item.type === 'choice' || item.type === 'open-choice') {
    return !!item.answerValueSet || !!item.answerOption?.length || hasAnswerExpression(item);
  }
  return true;
}

function hasAnswerExpression(item: QuestionnaireItem): boolean {
  return item.extension?.some((extension) => extension.url === ANSWER_EXPRESSION_EXTENSION_URL) ?? false;
}

function assertUniqueLinkIds(items: QuestionnaireItem[]): void {
  const linkIds = new Set<string>();
  const visit = (nestedItems: QuestionnaireItem[]): void => {
    for (const item of nestedItems) {
      if (linkIds.has(item.linkId)) {
        throw new OperationOutcomeError(badRequest(`Duplicate Questionnaire linkId '${item.linkId}'`));
      }
      linkIds.add(item.linkId);
      visit(item.item ?? []);
    }
  };
  visit(items);
}

function finalizeAssembledQuestionnaire(questionnaire: Questionnaire, state: AssemblyState): void {
  const extensions = questionnaire.extension ?? [];
  const adjustedExtensions: Extension[] = [];

  for (const extension of extensions) {
    if (extension.url !== ASSEMBLE_EXPECTATION_EXTENSION_URL) {
      if (extension.url !== ASSEMBLED_FROM_EXTENSION_URL) {
        adjustedExtensions.push(extension);
      }
      continue;
    }

    if (extension.valueCode === 'assemble-root') {
      continue;
    }
    if (extension.valueCode?.startsWith('assemble')) {
      adjustedExtensions.push({ ...extension, valueCode: extension.valueCode.replace(/^assemble/, 'independent') });
    } else {
      adjustedExtensions.push(extension);
    }
  }

  for (const canonical of state.assembledFrom) {
    adjustedExtensions.push({ url: ASSEMBLED_FROM_EXTENSION_URL, valueCanonical: canonical });
  }
  questionnaire.extension = adjustedExtensions.length > 0 ? adjustedExtensions : undefined;

  if (questionnaire.meta?.profile?.includes(SDC_MODULAR_PROFILE_URL)) {
    const profiles = questionnaire.meta.profile.filter((profile) => profile !== SDC_MODULAR_PROFILE_URL);
    questionnaire.meta = { ...questionnaire.meta, profile: profiles.length > 0 ? profiles : undefined };
  }
  questionnaire.contained = state.containedResources.length > 0 ? state.containedResources : undefined;
  delete questionnaire.text;

  if (questionnaire.version) {
    if (!questionnaire.version.endsWith('-assembled')) {
      questionnaire.version += '-assembled';
    }
  } else {
    questionnaire.version = randomUUID();
  }
}
