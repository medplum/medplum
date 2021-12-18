import { SearchParameter } from '@medplum/fhirtypes';
import { IndexedStructureDefinition } from './types';
import { capitalize } from './utils';

export enum SearchParameterType {
  BOOLEAN = 'BOOLEAN',
  NUMBER = 'NUMBER',
  QUANTITY = 'QUANTITY',
  TEXT = 'TEXT',
  REFERENCE = 'REFERENCE',
  DATE = 'DATE',
  DATETIME = 'DATETIME',
  PERIOD = 'PERIOD',
}

export interface SearchParameterDetails {
  readonly columnName: string;
  readonly type: SearchParameterType;
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
 * @param structureDefinitions Collection of StructureDefinition resources indexed by name.
 * @param resourceType The root resource type.
 * @param searchParam The search parameter.
 * @returns The search parameter type details.
 */
export function getSearchParameterDetails(
  structureDefinitions: IndexedStructureDefinition,
  resourceType: string,
  searchParam: SearchParameter
): SearchParameterDetails {
  const columnName = convertCodeToColumnName(searchParam.code as string);
  const expression = getExpressionForResourceType(resourceType, searchParam.expression as string)?.split('.');
  if (!expression) {
    // This happens on compound types
    // In the future, explore returning multiple column definitions
    return { columnName, type: SearchParameterType.TEXT };
  }

  let baseType = resourceType;
  let propertyType = undefined;
  let array = false;

  for (let i = 1; i < expression.length; i++) {
    const propertyName = expression[i];
    const propertyDef = structureDefinitions.types[baseType]?.properties?.[propertyName];
    if (!propertyDef) {
      // This happens on complex properties such as "collected[x]"/"collectedDateTime"/"collectedPeriod"
      // In the future, explore returning multiple column definitions
      return { columnName, type: SearchParameterType.TEXT, array };
    }

    if (propertyDef.max === '*') {
      array = true;
    }

    propertyType = propertyDef.type?.[0].code;
    if (!propertyType) {
      // This happens when one of parent properties uses contentReference
      // In the future, explore following the reference
      return { columnName, type: SearchParameterType.TEXT, array };
    }

    if (i < expression.length - 1) {
      if (propertyType === 'Element' || propertyType === 'BackboneElement') {
        baseType = baseType + capitalize(propertyName);
      } else {
        baseType = propertyType;
      }
    }
  }

  const type = getSearchParameterType(searchParam, propertyType as string);
  return { columnName, type, array };
}

/**
 * Converts a hyphen-delimited code to camelCase string.
 * @param code The search parameter code.
 * @returns The SQL column name.
 */
function convertCodeToColumnName(code: string): string {
  return code.split('-').reduce((result, word, index) => result + (index ? capitalize(word) : word), '');
}

function getSearchParameterType(searchParam: SearchParameter, propertyType: string): SearchParameterType {
  let type = SearchParameterType.TEXT;
  switch (searchParam.type) {
    case 'date':
      type = SearchParameterType.DATE;
      break;
    case 'number':
      type = SearchParameterType.NUMBER;
      break;
    case 'quantity':
      type = SearchParameterType.QUANTITY;
      break;
    case 'reference':
      type = SearchParameterType.REFERENCE;
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
    const simplified = simplifyExpression(e);
    if (simplified.startsWith(resourceType + '.')) {
      return simplified;
    }
  }
  return undefined;
}

function simplifyExpression(input: string): string {
  let result = input.trim();

  if (result.startsWith('(') && result.endsWith(')')) {
    result = result.substring(1, result.length - 1);
  }

  if (result.includes(' as ')) {
    result = result.substring(0, result.indexOf(' as '));
  }

  if (result.includes('.where(')) {
    result = result.substring(0, result.indexOf('.where('));
  }

  return result;
}
