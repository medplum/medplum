import {
  badRequest,
  evalFhirPathTyped,
  getSearchParameterDetails,
  OperationOutcomeError,
  Operator,
  PropertyType,
  toTypedValue,
  TypedValue,
} from '@medplum/core';
import { CodeableConcept, Coding, ContactPoint, Identifier, Resource, SearchParameter } from '@medplum/fhirtypes';

export const TokenColumnsFeature: { write: boolean; read: false | 'unified-tokens-column' | 'column-per-code' } = {
  write: true,
  read: false,
};

export interface Token {
  readonly code: string;
  readonly system: string | undefined;
  readonly value: string | undefined;
}

export const TokenIndexTypes = {
  CASE_SENSITIVE: 'CASE_SENSITIVE',
  CASE_INSENSITIVE: 'CASE_INSENSITIVE',
} as const;

export type TokenIndexType = (typeof TokenIndexTypes)[keyof typeof TokenIndexTypes];

/**
 * Returns A `TokenIndexTypes` value if the search parameter is of a type including both a system and value, undefined otherwise.
 * @param searchParam - The search parameter.
 * @param resourceType - The resource type.
 * @returns A `TokenIndexTypes` value if the search parameter is of a type including both a system and value, undefined otherwise.
 */
export function getTokenIndexType(searchParam: SearchParameter, resourceType: string): TokenIndexType | undefined {
  if (searchParam.type !== 'token') {
    return undefined;
  }

  if (searchParam.code?.endsWith(':identifier')) {
    return TokenIndexTypes.CASE_SENSITIVE;
  }

  const details = getSearchParameterDetails(resourceType, searchParam);

  if (!details.elementDefinitions?.length) {
    return undefined;
  }

  // Check for any "ContactPoint", "Identifier", "CodeableConcept", "Coding"
  // Any of those value types require the "Token" table for full system|value search semantics.
  // The common case is that the "type" property only has one value,
  // but we need to support arrays of types for the choice-of-type properties such as "value[x]".

  // Check for case-insensitive types first, as they are more specific than case-sensitive types
  for (const elementDefinition of details.elementDefinitions) {
    for (const type of elementDefinition.type ?? []) {
      if (type.code === PropertyType.ContactPoint) {
        return TokenIndexTypes.CASE_INSENSITIVE;
      }
    }
  }

  // In practice, search parameters covering an element definition with type  "ContactPoint"
  // are mutually exclusive from those covering "Identifier", "CodeableConcept", or "Coding" types,
  // but could technically be possible. A second set of nested for-loops with an early return should
  // be more efficient in the common case than always exhaustively looping through every
  // detail.elementDefinitions.type to see if "ContactPoint" is still to come.
  for (const elementDefinition of details.elementDefinitions) {
    for (const type of elementDefinition.type ?? []) {
      if (
        type.code === PropertyType.Identifier ||
        type.code === PropertyType.CodeableConcept ||
        type.code === PropertyType.Coding
      ) {
        return TokenIndexTypes.CASE_SENSITIVE;
      }
    }
  }

  // This is a "token" search parameter, but it is only "code", "string", or "boolean"
  // So we can use a simple column on the resource type table.
  return undefined;
}

/**
 * Builds a list of zero or more tokens for a search parameter and resource.
 * @param result - The result array where tokens will be added.
 * @param resource - The resource.
 * @param searchParam - The search parameter.
 * @param textSearchSystem - (optional) The system to use for :text-searchable tokens. Defaults to 'text'.
 */
export function buildTokensForSearchParameter(
  result: Token[],
  resource: Resource,
  searchParam: SearchParameter,
  textSearchSystem: string = 'text'
): void {
  const details = getSearchParameterDetails(resource.resourceType, searchParam);
  const typedValues = evalFhirPathTyped(details.parsedExpression, [toTypedValue(resource)]);

  const context: TokensContext = {
    searchParam,
    caseInsensitive: getTokenIndexType(searchParam, resource.resourceType) === TokenIndexTypes.CASE_INSENSITIVE,
    textSearchSystem,
  };

  for (const typedValue of typedValues) {
    buildTokens(context, result, typedValue);
  }
}

interface TokensContext {
  searchParam: SearchParameter;
  caseInsensitive: boolean;
  textSearchSystem?: string;
}

/**
 * Builds a list of zero or more tokens for a search parameter and value.
 * @param context - The context for building tokens.
 * @param result - The result array where tokens will be added.
 * @param typedValue - A typed value to be indexed for the search parameter.
 */
function buildTokens(context: TokensContext, result: Token[], typedValue: TypedValue): void {
  const { type, value } = typedValue;

  switch (type) {
    case PropertyType.Identifier:
      buildIdentifierToken(result, context, value as Identifier);
      break;
    case PropertyType.CodeableConcept:
      buildCodeableConceptToken(result, context, value as CodeableConcept);
      break;
    case PropertyType.Coding:
      buildCodingToken(result, context, value as Coding);
      break;
    case PropertyType.ContactPoint:
      buildContactPointToken(result, context, value as ContactPoint);
      break;
    default:
      buildSimpleToken(result, context, undefined, value?.toString() as string | undefined);
  }
}

/**
 * Builds an identifier token.
 * @param result - The result array where tokens will be added.
 * @param context - Context for building tokens.
 * @param identifier - The Identifier object to be indexed.
 */
function buildIdentifierToken(result: Token[], context: TokensContext, identifier: Identifier | undefined): void {
  if (identifier?.type?.text) {
    buildSimpleToken(result, context, context.textSearchSystem, identifier.type.text);
  }
  buildSimpleToken(result, context, identifier?.system, identifier?.value);
}

/**
 * Builds zero or more CodeableConcept tokens.
 * @param result - The result array where tokens will be added.
 * @param context - Context for building tokens.
 * @param codeableConcept - The CodeableConcept object to be indexed.
 */
function buildCodeableConceptToken(
  result: Token[],
  context: TokensContext,
  codeableConcept: CodeableConcept | undefined
): void {
  if (codeableConcept?.text) {
    buildSimpleToken(result, context, context.textSearchSystem, codeableConcept.text);
  }
  if (codeableConcept?.coding) {
    for (const coding of codeableConcept.coding) {
      buildCodingToken(result, context, coding);
    }
  }
}

/**
 * Builds a Coding token.
 * @param result - The result array where tokens will be added.
 * @param context - Context for building tokens.
 * @param coding - The Coding object to be indexed.
 */
function buildCodingToken(result: Token[], context: TokensContext, coding: Coding | undefined): void {
  if (coding) {
    if (coding.display) {
      buildSimpleToken(result, context, context.textSearchSystem, coding.display);
    }
    buildSimpleToken(result, context, coding.system, coding.code);
  }
}

/**
 * Builds a ContactPoint token.
 * @param result - The result array where tokens will be added.
 * @param context - Context for building tokens.
 * @param contactPoint - The ContactPoint object to be indexed.
 */
function buildContactPointToken(result: Token[], context: TokensContext, contactPoint: ContactPoint | undefined): void {
  if (contactPoint) {
    buildSimpleToken(result, context, contactPoint.system, contactPoint.value?.toLocaleLowerCase());
  }
}

/**
 * Builds a simple token.
 * @param result - The result array where tokens will be added.
 * @param context - Context for building tokens.
 * @param system - The token system.
 * @param value - The token value.
 */
function buildSimpleToken(
  result: Token[],
  context: TokensContext,
  system: string | undefined,
  value: string | undefined
): void {
  // Only add the token if there is a system or a value, and if it is not already in the list.
  if (
    (system || value) &&
    !result.some((token) => token.code === context.searchParam.code && token.system === system && token.value === value)
  ) {
    result.push({
      code: context.searchParam.code as string,
      system,
      value: value && context.caseInsensitive ? value.toLocaleLowerCase() : value,
    });
  }
}

/**
 * Returns true if the filter requires a token to exist based on the provided :missing or :present filter
 * @param operator - Either Operator.MISSING or Operator.PRESENT
 * @param value - Filter value
 * @returns true if the filter requires a token to exist based on the provided :missing or :present filter
 */
export function shouldTokenExistForMissingOrPresent(
  operator: (typeof Operator)['MISSING' | 'PRESENT'],
  value: string
): boolean {
  if (operator === Operator.MISSING) {
    // Missing = true means that there should not be a row
    switch (value.toLowerCase()) {
      case 'true':
        return false;
      case 'false':
        return true;
      default:
        throw new OperationOutcomeError(badRequest("Search filter ':missing' must have a value of 'true' or 'false'"));
    }
  } else if (operator === Operator.PRESENT) {
    // Present = true means that there should be a row
    switch (value.toLowerCase()) {
      case 'true':
        return true;
      case 'false':
        return false;
      default:
        throw new OperationOutcomeError(badRequest("Search filter ':present' must have a value of 'true' or 'false'"));
    }
  }
  return true;
}

/**
 * The following search parameters are affected by a change in FHIRpath's toString() method.
 * Each entry is in the format "<resourceType>|<SearchParameter.code>". SearchParameter.id is
 * not precise enough. E.g. `MedicationRequest|code` is included, but `Observation|code` is not
 * and both of those share the SearchParameter.id `clinical-code`.
 *
 * Background:
 *
 * PR #6266 fixed parentheses in infix operators' toString() methods. This revealed that
 * Atom.toString() is used in getSearchParameterDetails() when finding ElementDefinitions,
 * causing repo.ts to use different search strategies.
 *
 * These parameters previously used the "column" strategy but should use the "lookup-table" strategy.
 * To maintain backward compatibility during migration:
 * 1. We've added special case handling for these parameters (current state)
 * 2. We'll implement double-writing to both strategies (see GitHub issue https://github.com/medplum/medplum/issues/6271)
 * 3. We'll complete the transition during the token-table cleanup project
 *
 * Critical parameters to watch:
 * - MedicationRequest-code
 * - Observation-value-concept
 *
 * Most others are rarely-used "usageContext" parameters.
 *
 * DO NOT MODIFY THIS LIST without coordinating with the team responsible for search parameter
 * implementation. Any changes may require database reindexing.
 *
 * See follow-up issue: https://github.com/medplum/medplum/issues/6271
 */
const legacyTokenColumnSearchParamResourceTypeAndCodes = new Set([
  'ActivityDefinition|context',
  'CapabilityStatement|context',
  'ChargeItemDefinition|context',
  'CodeSystem|context',
  'CompartmentDefinition|context',
  'Composition|related-id',
  'ConceptMap|context',
  'DeviceRequest|code',
  'EffectEvidenceSynthesis|context',
  'EventDefinition|context',
  'Evidence|context',
  'EvidenceVariable|context',
  'ExampleScenario|context',
  'GraphDefinition|context',
  'Group|value',
  'ImplementationGuide|context',
  'Library|context',
  'Measure|context',
  'Medication|ingredient-code',
  'MedicationAdministration|code',
  'MedicationDispense|code',
  'MedicationKnowledge|ingredient-code',
  'MedicationRequest|code',
  'MedicationStatement|code',
  'MessageDefinition|context',
  'NamingSystem|context',
  'Observation|combo-value-concept',
  'Observation|component-value-concept',
  'Observation|value-concept',
  'OperationDefinition|context',
  'PlanDefinition|context',
  'Questionnaire|context',
  'ResearchDefinition|context',
  'ResearchElementDefinition|context',
  'RiskEvidenceSynthesis|context',
  'SearchParameter|context',
  'StructureDefinition|context',
  'StructureMap|context',
  'TerminologyCapabilities|context',
  'TestScript|context',
  'ValueSet|context',
]);

export function isLegacyTokenColumnSearchParameter(searchParam: SearchParameter, resourceType: string): boolean {
  return legacyTokenColumnSearchParamResourceTypeAndCodes.has(`${resourceType}|${searchParam.code}`);
}
