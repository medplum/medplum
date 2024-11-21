import { ElementDefinitionType, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { Atom } from '../fhirlexer/parse';
import {
  AsAtom,
  BooleanInfixOperatorAtom,
  DotAtom,
  FunctionAtom,
  IndexerAtom,
  IsAtom,
  UnionAtom,
} from '../fhirpath/atoms';
import { parseFhirPath } from '../fhirpath/parse';
import { PropertyType, getElementDefinition, globalSchema } from '../types';
import { InternalSchemaElement } from '../typeschema/types';
import { capitalize, lazy } from '../utils';

export enum SearchParameterType {
  BOOLEAN = 'BOOLEAN',
  NUMBER = 'NUMBER',
  QUANTITY = 'QUANTITY',
  TEXT = 'TEXT',
  REFERENCE = 'REFERENCE',
  CANONICAL = 'CANONICAL',
  DATE = 'DATE',
  DATETIME = 'DATETIME',
  PERIOD = 'PERIOD',
  UUID = 'UUID',
}

export interface SearchParameterDetails {
  readonly columnName: string;
  readonly type: SearchParameterType;
  readonly elementDefinitions?: InternalSchemaElement[];
  readonly array?: boolean;
  readonly implementation: 'column' | 'lookup-table' | 'token-columns';
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
  let columnName = convertCodeToColumnName(code);
  const expressions = getExpressionsForResourceType(resourceType, searchParam.expression as string);

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

  let implementation: SearchParameterDetails['implementation'] = 'column';
  if (searchParam.code.startsWith('_')) {
    console.log(`Skipping special implementation for internal search parameter: ${searchParam.code}`);
  } else if (!searchParam.base?.includes(resourceType as ResourceType)) {
    console.log(`Skipping special implementation for search parameter: ${searchParam.code} ${searchParam.base}`);
    // If the search parameter is not defined on the resource type itself, skip special implementations
  } else if (isLookupTableParam(searchParam, builder)) {
    implementation = 'lookup-table';
  } else if (isTokenParam(searchParam, builder)) {
    implementation = 'token-columns';
    const telecomParams = [
      'individual-telecom',
      'individual-email',
      'individual-phone',
      'OrganizationAffiliation-telecom',
      'OrganizationAffiliation-email',
      'OrganizationAffiliation-phone',
    ];
    if (telecomParams.includes(searchParam.id as string)) {
      columnName = 'telecom';
    }
  }

  const result: SearchParameterDetails = {
    columnName,
    type: getSearchParameterType(searchParam, builder.propertyTypes),
    elementDefinitions: builder.elementDefinitions,
    array: builder.array,
    implementation,
  };
  setSearchParameterDetails(resourceType, code, result);
  return result;
}

function isLookupTableParam(searchParam: SearchParameter, builder: SearchParameterDetailsBuilder): boolean {
  // HumanName
  const nameParams = [
    'individual-given',
    'individual-family',
    'Patient-name',
    'Person-name',
    'Practitioner-name',
    'RelatedPerson-name',
  ];
  if (nameParams.includes(searchParam.id as string)) {
    return true;
  }

  // Telecom
  const telecomParams = [
    'individual-telecom',
    'individual-email',
    'individual-phone',
    'OrganizationAffiliation-telecom',
    'OrganizationAffiliation-email',
    'OrganizationAffiliation-phone',
  ];
  if (telecomParams.includes(searchParam.id as string)) {
    // return true;
  }

  // Address
  const addressParams = ['individual-address', 'InsurancePlan-address', 'Location-address', 'Organization-address'];
  if (addressParams.includes(searchParam.id as string)) {
    return true;
  }

  // "address-"
  if (searchParam.code?.startsWith('address-')) {
    return true;
  }

  // Token
  if (isTokenParam(searchParam, builder)) {
    // console.log('SKIPPING LookupTable for token param', searchParam.id);
    // return true;
  }

  return false;
}

function isTokenParam(searchParam: SearchParameter, builder: SearchParameterDetailsBuilder): boolean {
  if (searchParam.type === 'token') {
    if (searchParam.code?.endsWith(':identifier')) {
      return true;
    }
    for (const elementDefinition of builder.elementDefinitions ?? []) {
      // Check for any "Identifier", "CodeableConcept", or "Coding"
      // Any of those value types require the "Token" table for full system|value search semantics.
      // The common case is that the "type" property only has one value,
      // but we need to support arrays of types for the choice-of-type properties such as "value[x]".
      for (const type of elementDefinition.type ?? []) {
        if (
          type.code === PropertyType.Identifier ||
          type.code === PropertyType.CodeableConcept ||
          type.code === PropertyType.Coding ||
          type.code === PropertyType.ContactPoint
        ) {
          return true;
        }
      }
    }
  }
  return false;
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

  if (elementDefinition.isArray && !hasArrayIndex) {
    details.array = true;
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

/**
 * Converts a hyphen-delimited code to camelCase string.
 * @param code - The search parameter code.
 * @returns The SQL column name.
 */
function convertCodeToColumnName(code: string): string {
  return code.split('-').reduce((result, word, index) => result + (index ? capitalize(word) : word), '');
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

function buildExpressionsForResourceType(resourceType: string, atom: Atom, result: Atom[]): void {
  if (atom instanceof UnionAtom) {
    buildExpressionsForResourceType(resourceType, atom.left, result);
    buildExpressionsForResourceType(resourceType, atom.right, result);
  } else {
    const str = atom.toString();
    if (str.startsWith(resourceType + '.')) {
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
