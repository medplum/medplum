// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceType, SearchParameter } from '@medplum/fhirtypes';
import type { Atom } from '../fhirlexer/parse';
import { InfixOperatorAtom } from '../fhirlexer/parse';
import { AsAtom, DotAtom, FhirPathAtom, FunctionAtom, IndexerAtom, IsAtom, UnionAtom } from '../fhirpath/atoms';
import { parseFhirPath } from '../fhirpath/parse';
import { getElementDefinition, globalSchema, PropertyType } from '../types';
import type { InternalSchemaElement } from '../typeschema/types';
import { EMPTY, lazy } from '../utils';
import { getInnerDerivedIdentifierExpression, getParsedDerivedIdentifierExpression } from './derived';

export const SearchParameterType = {
  BOOLEAN: 'BOOLEAN',
  NUMBER: 'NUMBER',
  QUANTITY: 'QUANTITY',
  TEXT: 'TEXT',
  REFERENCE: 'REFERENCE',
  CANONICAL: 'CANONICAL',
  DATE: 'DATE',
  DATETIME: 'DATETIME',
  PERIOD: 'PERIOD',
  UUID: 'UUID',
} as const;
export type SearchParameterType = (typeof SearchParameterType)[keyof typeof SearchParameterType];

export interface SearchParameterDetails {
  readonly type: SearchParameterType;
  readonly elementDefinitions?: InternalSchemaElement[];
  readonly parsedExpression: FhirPathAtom;
  readonly array?: boolean;
  readonly referenceTargetTypes?: ResourceType[];
}

interface SearchParameterDetailsBuilder {
  elementDefinitions: InternalSchemaElement[];
  propertyTypes: Set<string>;
  array: boolean;
}

/**
 * Returns the type details of a SearchParameter.
 *
 * The SearchParameter resource has a "type" parameter, but that is missing some critical information.
 *
 * For example:
 *   1) The "date" type includes "date", "datetime", and "period".
 *   2) The "token" type includes enums and booleans.
 *   3) Arrays/multiple values are not reflected at all.
 * @param resourceType - The root resource type.
 * @param searchParam - The search parameter.
 * @returns The search parameter type details.
 */
export function getSearchParameterDetails(resourceType: string, searchParam: SearchParameter): SearchParameterDetails {
  return (
    globalSchema.types[resourceType]?.searchParamsDetails?.[searchParam.code] ??
    buildSearchParameterDetails(resourceType, searchParam)
  );
}

function setSearchParameterDetails(resourceType: string, code: string, details: SearchParameterDetails): void {
  let typeSchema = globalSchema.types[resourceType];
  if (!typeSchema) {
    typeSchema = {};
    globalSchema.types[resourceType] = typeSchema;
  }
  if (!typeSchema.searchParamsDetails) {
    typeSchema.searchParamsDetails = {};
  }
  typeSchema.searchParamsDetails[code] = details;
}

function buildSearchParameterDetails(resourceType: string, searchParam: SearchParameter): SearchParameterDetails {
  const code = searchParam.code;
  const expression = searchParam.expression as string;
  const expressions = getExpressionsForResourceType(resourceType, expression);

  const builder: SearchParameterDetailsBuilder = {
    elementDefinitions: [],
    propertyTypes: new Set(),
    array: false,
  };

  for (const expression of expressions) {
    const atomArray = flattenAtom(expression);
    const flattenedExpression = lazy(() => atomArray.join('.'));

    if (atomArray.length === 1 && atomArray[0] instanceof InfixOperatorAtom && atomArray[0].operator !== '.') {
      builder.propertyTypes.add('boolean');
    } else if (searchParam.code.endsWith(':identifier')) {
      // This is a derived "identifier" search parameter
      // See `deriveIdentifierSearchParameter`
      builder.propertyTypes.add('Identifier');
    } else if (
      // To support US Core Patient search parameters without needing profile-aware logic,
      // assume expressions for `Extension.value[x].code` and `Extension.value[x].coding.code`
      // are of type `code`. Otherwise, crawling the Extension.value[x] element definition without
      // access to the type narrowing specified in the profiles would be inconclusive.
      flattenedExpression().endsWith('extension.value.code') ||
      flattenedExpression().endsWith('extension.value.coding.code')
    ) {
      builder.array = true;
      builder.propertyTypes.clear();
      builder.propertyTypes.add('code');
    } else {
      crawlSearchParameterDetails(builder, atomArray, resourceType, 1);
    }

    // To support US Core "us-core-condition-asserted-date" search parameter without
    // needing profile-aware logic, ensure extensions with a dateTime value are not
    // treated as arrays since Mepdlum search functionality does not yet support datetime arrays.
    // This would be the result if the http://hl7.org/fhir/StructureDefinition/condition-assertedDate
    // extension were parsed since it specifies a cardinality of 0..1.
    if (flattenedExpression().endsWith('extension.valueDateTime')) {
      builder.array = false;
      builder.propertyTypes.clear();
      builder.propertyTypes.add('dateTime');
    }
  }

  let parsedExpression: FhirPathAtom;
  if (searchParam.code.endsWith(':identifier')) {
    // Derived identifier search parameters define their expressions like "(Condition).identifier"
    // This breaks the optimizations in `getExpressionsForResourceType` that filter out other unioned resource types,
    // To keep the optimization, extract the inner expression and then manually add the ".identifier" wrapper.
    const innerExpression = getInnerDerivedIdentifierExpression(expression);
    if (innerExpression === undefined) {
      throw new Error(`Unexpected expression for derived identifier search parameter: ${expression}`);
    }
    const parsedInnerExpression = getParsedExpressionForResourceType(resourceType, innerExpression);
    parsedExpression = getParsedDerivedIdentifierExpression(expression, parsedInnerExpression);
  } else {
    parsedExpression = getParsedExpressionForResourceType(resourceType, expression);
  }

  const elementDefinitions = builder.elementDefinitions
    .map((ed) => ({ ...ed, type: ed.type?.filter((t) => builder.propertyTypes.has(t.code)) }))
    .filter((ed) => ed.type && ed.type.length > 0);

  const result: SearchParameterDetails = {
    type: getSearchParameterType(searchParam, builder.propertyTypes),
    elementDefinitions,
    parsedExpression,
    array: builder.array,
    referenceTargetTypes: getReferenceTargetTypes(searchParam, elementDefinitions),
  };
  setSearchParameterDetails(resourceType, code, result);
  return result;
}

function crawlSearchParameterDetails(
  details: SearchParameterDetailsBuilder,
  atoms: Atom[],
  baseType: string,
  index: number
): void {
  const currAtom = atoms[index];

  if (currAtom instanceof AsAtom) {
    details.propertyTypes.add(currAtom.right.toString());
    return;
  }

  if (currAtom instanceof FunctionAtom) {
    handleFunctionAtom(details, currAtom);
    return;
  }

  const propertyName = currAtom.toString();
  const elementDefinition = getElementDefinition(baseType, propertyName);
  if (!elementDefinition) {
    throw new Error(`Element definition not found for ${baseType} ${propertyName}`);
  }

  let hasArrayIndex = false;
  let nextIndex = index + 1;
  if (nextIndex < atoms.length && atoms[nextIndex] instanceof IndexerAtom) {
    hasArrayIndex = true;
    nextIndex++;
  }

  const nextAtom = atoms[nextIndex];

  if (elementDefinition.isArray && !hasArrayIndex) {
    details.array = true;
  }

  if (nextIndex === atoms.length - 1) {
    // This is the penultimate atom in the expression
    // If the last atom is a type guard (i.e. an "as" expression or ofType() function), use that type
    if (nextAtom instanceof AsAtom) {
      details.elementDefinitions.push(elementDefinition);
      details.propertyTypes.add(nextAtom.right.toString());
      return;
    }
    if (nextAtom instanceof FunctionAtom && nextAtom.name === 'ofType') {
      details.elementDefinitions.push(elementDefinition);
      details.propertyTypes.add(nextAtom.args[0].toString());
      return;
    }
  }

  if (nextIndex >= atoms.length) {
    // This is the final atom in the expression
    // So we can collect the ElementDefinition and property types
    details.elementDefinitions.push(elementDefinition);
    for (const elementDefinitionType of elementDefinition.type ?? EMPTY) {
      details.propertyTypes.add(elementDefinitionType.code);
    }
    return;
  }

  // This is in the middle of the expression, so we need to keep crawling.
  // "code" is only missing when using "contentReference"
  // "contentReference" is handled whe parsing StructureDefinition into InternalTypeSchema
  for (const elementDefinitionType of elementDefinition.type ?? EMPTY) {
    let propertyType = elementDefinitionType.code;
    if (isBackboneElement(propertyType)) {
      propertyType = elementDefinition.type[0].code;
    }
    crawlSearchParameterDetails(details, atoms, propertyType, nextIndex);
  }
}

function handleFunctionAtom(builder: SearchParameterDetailsBuilder, functionAtom: FunctionAtom): void {
  if (functionAtom.name === 'as') {
    builder.propertyTypes.add(functionAtom.args[0].toString());
    return;
  }

  if (functionAtom.name === 'ofType') {
    builder.propertyTypes.add(functionAtom.args[0].toString());
    return;
  }

  if (functionAtom.name === 'resolve') {
    // Handle .resolve().resourceType
    builder.propertyTypes.add('string');
    return;
  }

  if (functionAtom.name === 'where' && functionAtom.args[0] instanceof IsAtom) {
    // Common pattern: "where(resolve() is Patient)"
    // Use the type information
    builder.propertyTypes.add(functionAtom.args[0].right.toString());
    return;
  }

  throw new Error(`Unhandled FHIRPath function: ${functionAtom.name}`);
}

function isBackboneElement(propertyType: string): boolean {
  return propertyType === 'Element' || propertyType === 'BackboneElement';
}

function getSearchParameterType(searchParam: SearchParameter, propertyTypes: Set<string>): SearchParameterType {
  switch (searchParam.type) {
    case 'date':
      if (propertyTypes.size === 1 && propertyTypes.has(PropertyType.date)) {
        return SearchParameterType.DATE;
      } else {
        return SearchParameterType.DATETIME;
      }
    case 'number':
      return SearchParameterType.NUMBER;
    case 'quantity':
      return SearchParameterType.QUANTITY;
    case 'reference':
      if (propertyTypes.has(PropertyType.canonical)) {
        return SearchParameterType.CANONICAL;
      } else {
        return SearchParameterType.REFERENCE;
      }
    case 'token':
      if (propertyTypes.size === 1 && propertyTypes.has(PropertyType.boolean)) {
        return SearchParameterType.BOOLEAN;
      } else {
        return SearchParameterType.TEXT;
      }
    default:
      return SearchParameterType.TEXT;
  }
}

export function getExpressionsForResourceType(resourceType: string, expression: string): Atom[] {
  const result: Atom[] = [];
  const fhirPathExpression = parseFhirPath(expression);
  buildExpressionsForResourceType(resourceType, fhirPathExpression.child, result);
  return result;
}

export function getExpressionForResourceType(resourceType: string, expression: string): string | undefined {
  const atoms = getExpressionsForResourceType(resourceType, expression);
  if (atoms.length === 0) {
    return undefined;
  }
  return atoms.map((atom) => atom.toString()).join(' | ');
}

export function getParsedExpressionForResourceType(resourceType: string, expression: string): FhirPathAtom {
  const atoms: Atom[] = [];
  const fhirPathExpression = parseFhirPath(expression);
  buildExpressionsForResourceType(resourceType, fhirPathExpression.child, atoms);

  if (atoms.length === 0) {
    return fhirPathExpression;
  }

  let result: Atom = atoms[0];
  for (let i = 1; i < atoms.length; i++) {
    result = new UnionAtom(result, atoms[i]);
  }
  return new FhirPathAtom('<original-not-available>', result);
}

function buildExpressionsForResourceType(resourceType: string, atom: Atom, result: Atom[]): void {
  if (atom instanceof UnionAtom) {
    buildExpressionsForResourceType(resourceType, atom.left, result);
    buildExpressionsForResourceType(resourceType, atom.right, result);
  } else {
    const str = atom.toString();
    if (str.includes(resourceType + '.')) {
      result.push(atom);
    }
  }
}

function flattenAtom(atom: Atom): Atom[] {
  if (atom instanceof AsAtom || atom instanceof IndexerAtom) {
    return [flattenAtom(atom.left), atom].flat();
  }
  if (atom instanceof InfixOperatorAtom && atom.operator !== '.') {
    return [atom];
  }
  if (atom instanceof DotAtom) {
    return [flattenAtom(atom.left), flattenAtom(atom.right)].flat();
  }
  if (atom instanceof FunctionAtom) {
    if (atom.name === 'where' && !(atom.args[0] instanceof IsAtom)) {
      // Remove all "where" functions other than "where(x as type)"
      return [];
    }
    if (atom.name === 'last') {
      // Remove all "last" functions
      return [];
    }
  }
  return [atom];
}

/**
 * Returns the reference target type for a search parameter on a
 * specific resource type.  Shared search parameters (e.g. `encounter`) may
 * list multiple targets globally, but the element definition on a concrete
 * resource (e.g. `DeviceRequest.encounter`) often narrows it to exactly one.
 *
 * @param searchParam - The search parameter definition.
 * @param elementDefs - The element definitions for the resource type.
 * @returns The target resource types, or undefined if there are zero targets.
 */
function getReferenceTargetTypes(
  searchParam: SearchParameter,
  elementDefs: InternalSchemaElement[] | undefined
): ResourceType[] | undefined {
  // Fast path: the SearchParameter itself has exactly one target type.
  if (searchParam.target?.length === 1) {
    return searchParam.target;
  }

  // Derive from element definitions (resource-specific target profiles).
  if (elementDefs) {
    const targetTypes = new Set<string>();
    for (const ed of elementDefs) {
      for (const t of ed.type) {
        if (t.code !== 'Reference' || !t.targetProfile) {
          continue;
        }
        for (const profile of t.targetProfile) {
          const resourceType = profile.split('/').at(-1);
          if (resourceType && resourceType !== 'Resource') {
            targetTypes.add(resourceType);
          }
        }
      }
    }
    if (targetTypes.size > 0) {
      return Array.from(targetTypes) as ResourceType[];
    }
  }

  return undefined;
}
