import { ElementDefinition, SearchParameter } from '@medplum/fhirtypes';
import { buildTypeName, getElementDefinition, globalSchema, PropertyType } from '../types';
import { capitalize } from '../utils';

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
  readonly elementDefinition?: ElementDefinition;
  readonly array?: boolean;
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
 *
 * @param resourceType The root resource type.
 * @param searchParam The search parameter.
 * @returns The search parameter type details.
 */
export function getSearchParameterDetails(resourceType: string, searchParam: SearchParameter): SearchParameterDetails {
  let result: SearchParameterDetails | undefined =
    globalSchema.types[resourceType]?.searchParamsDetails?.[searchParam.code as string];
  if (!result) {
    result = buildSearchParamterDetails(resourceType, searchParam);
  }
  return result;
}

function setSearchParamterDetails(resourceType: string, code: string, details: SearchParameterDetails): void {
  const typeSchema = globalSchema.types[resourceType];
  if (!typeSchema.searchParamsDetails) {
    typeSchema.searchParamsDetails = {};
  }
  typeSchema.searchParamsDetails[code] = details;
}

function buildSearchParamterDetails(resourceType: string, searchParam: SearchParameter): SearchParameterDetails {
  const code = searchParam.code as string;
  const columnName = convertCodeToColumnName(code);
  const expression = getExpressionForResourceType(resourceType, searchParam.expression as string)?.split('.');
  if (!expression) {
    // This happens on compound types
    // In the future, explore returning multiple column definitions
    return { columnName, type: SearchParameterType.TEXT };
  }

  const defaultType = getSearchParameterType(searchParam);
  let baseType = resourceType;
  let elementDefinition = undefined;
  let propertyType = undefined;
  let array = false;

  for (let i = 1; i < expression.length; i++) {
    const propertyName = expression[i];
    elementDefinition = getElementDefinition(baseType, propertyName);
    if (!elementDefinition) {
      throw new Error(`Element definition not found for ${resourceType} ${searchParam.code}`);
    }

    if (elementDefinition.max === '*') {
      array = true;
    }

    propertyType = elementDefinition.type?.[0].code;
    if (!propertyType) {
      // This happens when one of parent properties uses contentReference
      // In the future, explore following the reference
      return { columnName, type: defaultType, array };
    }

    if (i < expression.length - 1) {
      if (isBackboneElement(propertyType)) {
        baseType = buildTypeName(elementDefinition.path?.split('.') as string[]);
      } else {
        baseType = propertyType;
      }
    }
  }

  const type = getSearchParameterType(searchParam, propertyType as PropertyType);
  const result = { columnName, type, elementDefinition, array };
  setSearchParamterDetails(resourceType, code, result);
  return result;
}

function isBackboneElement(propertyType: string): boolean {
  return propertyType === 'Element' || propertyType === 'BackboneElement';
}

/**
 * Converts a hyphen-delimited code to camelCase string.
 * @param code The search parameter code.
 * @returns The SQL column name.
 */
function convertCodeToColumnName(code: string): string {
  return code.split('-').reduce((result, word, index) => result + (index ? capitalize(word) : word), '');
}

function getSearchParameterType(searchParam: SearchParameter, propertyType?: PropertyType): SearchParameterType {
  let type = SearchParameterType.TEXT;
  switch (searchParam.type) {
    case 'date':
      if (propertyType === PropertyType.dateTime || propertyType === PropertyType.instant) {
        type = SearchParameterType.DATETIME;
      } else {
        type = SearchParameterType.DATE;
      }
      break;
    case 'number':
      type = SearchParameterType.NUMBER;
      break;
    case 'quantity':
      type = SearchParameterType.QUANTITY;
      break;
    case 'reference':
      if (propertyType === PropertyType.canonical) {
        type = SearchParameterType.CANONICAL;
      } else {
        type = SearchParameterType.REFERENCE;
      }
      break;
    case 'token':
      if (propertyType === 'boolean') {
        type = SearchParameterType.BOOLEAN;
      }
      break;
  }
  return type;
}

export function getExpressionForResourceType(resourceType: string, expression: string): string | undefined {
  const expressions = expression.split(' | ');
  for (const e of expressions) {
    if (isIgnoredExpression(e)) {
      continue;
    }
    const simplified = simplifyExpression(e);
    if (simplified.startsWith(resourceType + '.')) {
      return simplified;
    }
  }
  return undefined;
}

function isIgnoredExpression(input: string): boolean {
  return input.includes(' as Period') || input.includes(' as SampledDate');
}

function simplifyExpression(input: string): string {
  let result = input.trim();

  if (result.startsWith('(') && result.endsWith(')')) {
    result = result.substring(1, result.length - 1);
  }

  if (result.includes('[0]')) {
    result = result.replaceAll('[0]', '');
  }

  const stopStrings = [' != ', ' as ', '.as(', '.exists(', '.resolve(', '.where('];
  for (const stopString of stopStrings) {
    if (result.includes(stopString)) {
      result = result.substring(0, result.indexOf(stopString));
    }
  }

  return result;
}
