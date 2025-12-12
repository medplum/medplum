import { ElementDefinitionType, SearchParameter } from '@medplum/fhirtypes';
import { Atom } from '../fhirlexer/parse';
import {
  AsAtom,
  BooleanInfixOperatorAtom,
  DotAtom,
  FhirPathAtom,
  FunctionAtom,
  IndexerAtom,
  IsAtom,
  UnionAtom,
} from '../fhirpath/atoms';
import { parseFhirPath } from '../fhirpath/parse';
import { PropertyType, getElementDefinition, globalSchema } from '../types';
import { InternalSchemaElement } from '../typeschema/types';
import { lazy } from '../utils';
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
  let result: SearchParameterDetails | undefined =
    globalSchema.types[resourceType]?.searchParamsDetails?.[searchParam.code as string];
  if (!result) {
    result = buildSearchParameterDetails(resourceType, searchParam);
  }
  return result;
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
  const code = searchParam.code as string;
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

    if (atomArray.length === 1 && atomArray[0] instanceof BooleanInfixOperatorAtom) {
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

  const result: SearchParameterDetails = {
    type: getSearchParameterType(searchParam, builder.propertyTypes),
    elementDefinitions: builder.elementDefinitions,
    parsedExpression,
    array: builder.array,
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

  if (nextIndex === atoms.length - 1 && nextAtom instanceof AsAtom) {
    // This is the 2nd to last atom in the expression
    // And the last atom is an "as" expression
    details.elementDefinitions.push(elementDefinition);
    details.propertyTypes.add(nextAtom.right.toString());
    return;
  }

  if (nextIndex >= atoms.length) {
    // This is the final atom in the expression
    // So we can collect the ElementDefinition and property types
    details.elementDefinitions.push(elementDefinition);
    for (const elementDefinitionType of elementDefinition.type as ElementDefinitionType[]) {
      details.propertyTypes.add(elementDefinitionType.code as string);
    }
    return;
  }

  // This is in the middle of the expression, so we need to keep crawling.
  // "code" is only missing when using "contentReference"
  // "contentReference" is handled whe parsing StructureDefinition into InternalTypeSchema
  for (const elementDefinitionType of elementDefinition.type as ElementDefinitionType[]) {
    let propertyType = elementDefinitionType.code as string;
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
  if (atom instanceof BooleanInfixOperatorAtom) {
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
