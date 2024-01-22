import { InternalSchemaElement, InternalTypeSchema, TypedValue, capitalize, deepClone, isObject } from '@medplum/core';
import React from 'react';

/**
 * Splits a string on the last occurrence of the delimiter
 * @param str - The string to split
 * @param delim - The delimiter string
 * @returns An array of two strings; the first consisting of the beginning of the
 * string up to the last occurrence of the delimiter. the second is the remainder of the
 * string after the last occurrence of the delimiter. If the delimiter is not present
 * in the string, the first element is empty and the second is the input string.
 */
function splitOnceRight(str: string, delim: string): [string, string] {
  const delimIndex = str.lastIndexOf(delim);
  if (delimIndex === -1) {
    return ['', str];
  }
  const beginning = str.substring(0, delimIndex);
  const last = str.substring(delimIndex + delim.length);
  return [beginning, last];
}

export type ElementsContextType = {
  debugMode: boolean;
  profileUrl: string | undefined;
  /**
   * Get the element definition for the specified path if it has been modified by a profile.
   * @param nestedElementPath - The path of the nested element
   * @returns The modified element definition if it has been modified by the active profile or undefined. If undefined,
   * the element has the default definition for the given type.
   */
  getModifiedNestedElement: (nestedElementPath: string) => InternalSchemaElement | undefined;
  getElementByPath: (path: string) => InternalSchemaElement | undefined;
  elements: Record<string, InternalSchemaElement>;
  elementsByPath: Record<string, InternalSchemaElement>;
  modifyDefaultValue: <T extends object>(defaultValue: T, debugMode?: boolean) => T;
};

export const ElementsContext = React.createContext<ElementsContextType>({
  profileUrl: undefined,
  debugMode: false,
  getModifiedNestedElement: () => undefined,
  getElementByPath: () => undefined,
  elements: Object.create(null),
  elementsByPath: Object.create(null),
  modifyDefaultValue: (defaultValue) => defaultValue,
});
ElementsContext.displayName = 'ElementsContext';

export type BuildElementsContextArgs = {
  elements: InternalTypeSchema['elements'] | undefined;
  parentPath: string;
  parentContext: ElementsContextType | undefined;
  parentType: string;
  profileUrl?: string;
  debugMode?: boolean;
};

export function buildElementsContext({
  parentContext,
  elements,
  parentPath,
  parentType,
  profileUrl,
  debugMode,
}: BuildElementsContextArgs): ElementsContextType {
  if (debugMode) {
    console.debug('Building ElementsContext', { parentPath, profileUrl, elements });
  }
  const mergedElements: ElementsContextType['elements'] = mergeElementsForContext(
    parentPath,
    elements,
    parentContext,
    Boolean(debugMode)
  );

  const nestedPaths: Record<string, InternalSchemaElement> = Object.create(null);
  const elementsByPath: ElementsContextType['elementsByPath'] = Object.create(null);

  const seenKeys = new Set<string>();
  for (const [key, property] of Object.entries(mergedElements)) {
    elementsByPath[parentPath + '.' + key] = property;

    const [beginning, _last] = splitOnceRight(key, '.');
    // assume paths are hierarchically sorted, e.g. identifier comes before identifier.id
    if (seenKeys.has(beginning)) {
      nestedPaths[parentType + '.' + key] = property;
    }
    seenKeys.add(key);
  }

  function getElementByPath(path: string): InternalSchemaElement | undefined {
    return elementsByPath[path];
  }

  function getModifiedNestedElement(nestedElementPath: string): InternalSchemaElement | undefined {
    return nestedPaths[nestedElementPath];
  }

  function modifyDefaultValue<T extends object>(defaultValue: T, debugMode?: boolean): T {
    const result = modifyDefaultValueImpl(
      { type: parentType, value: defaultValue },
      mergedElements,
      Boolean(debugMode)
    );
    return result;
  }

  return {
    debugMode: debugMode ?? parentContext?.debugMode ?? false,
    profileUrl: profileUrl ?? parentContext?.profileUrl,
    getModifiedNestedElement,
    getElementByPath,
    elements: mergedElements,
    elementsByPath,
    modifyDefaultValue,
  };
}

function mergeElementsForContext(
  parentPath: string,
  elements: BuildElementsContextArgs['elements'],
  parentContext: BuildElementsContextArgs['parentContext'],
  debugMode: boolean
): ElementsContextType['elements'] {
  const result: ElementsContextType['elements'] = Object.create(null);

  if (parentContext) {
    const parentPathPrefix = parentPath + '.';
    for (const [path, element] of Object.entries(parentContext.elementsByPath)) {
      if (path.startsWith(parentPathPrefix)) {
        const key = path.slice(parentPathPrefix.length);
        result[key] = element;
      }
    }
  }

  let usedNewElements = false;
  if (elements) {
    for (const [key, element] of Object.entries(elements)) {
      if (!(key in result)) {
        result[key] = element;
        usedNewElements = true;
      }
    }
  }

  // TODO if no new elements are used, the elementscontext is very likely not necessary;
  // there could be an optimization where buildElementsContext returns undefined in this case
  // to avoid needless contexts
  if (debugMode && parentContext && !usedNewElements) {
    console.debug('ElementsContext elements same as parent context');
  }
  return result;
}

type ConsoleDebug = typeof console.debug;

function modifyDefaultValueImpl(
  defaultValue: TypedValue,
  elements: ElementsContextType['elements'],
  debugMode: boolean
): any {
  const inputType = defaultValue.type;
  const inputValue: any = defaultValue.value;

  if (Array.isArray(inputValue)) {
    return inputValue.map((iv) => modifyDefaultValueImpl({ type: defaultValue.type, value: iv }, elements, debugMode));
  }

  const debug: ConsoleDebug = debugMode ? console.debug : () => undefined;

  const outputValue: any = deepClone(inputValue);
  debug(`modifyDV  INPUT\ntype: ${inputType}\nvalue: ${JSON.stringify(outputValue)}`);

  for (const [key, element] of Object.entries(elements)) {
    if (element.fixed || element.pattern) {
      debug(
        `modifyDV key: ${key} ${element.fixed ? 'fixed' : 'pattern'}: ${JSON.stringify((element.fixed ?? element.pattern)?.value)}`
      );
      debug('modifyDV top', JSON.stringify(outputValue, undefined, 2));
    } else {
      continue;
    }

    const keyParts = key.split('.');
    let last: any = outputValue;
    for (let i = 0; i < keyParts.length; i++) {
      let keyPart = keyParts[i];
      if (keyPart.includes('[x]')) {
        const keyPartElem = elements[keyParts.slice(0, i + 1).join('.')];
        const code = keyPartElem.type[0].code;
        keyPart = keyPart.replace('[x]', capitalize(code));
      }

      if (i === keyParts.length - 1) {
        const lastArray = Array.isArray(last) ? last : [last];
        for (const item of lastArray) {
          if (element.fixed) {
            item[keyPart] = applyFixed(item[keyPart], element.fixed.value, debug);
          } else if (element.pattern) {
            item[keyPart] = applyPattern(item[keyPart], element.pattern.value, debug);
          }
        }
      } else {
        if (!(keyPart in last)) {
          const elementKey = keyParts.slice(0, i + 1).join('.');
          debug(`creating empty value for ${elementKey}`);
          last[keyPart] = elements[elementKey].isArray ? [Object.create(null)] : Object.create(null);
        }
        debug('setting last to', JSON.stringify(last[keyPart], undefined, 2));
        last = last[keyPart];
      }
    }
    debug('modifyDV bottom', JSON.stringify(outputValue, undefined, 2));
  }

  debug('modifyDV OUTPUT', JSON.stringify(outputValue));
  return outputValue;
}

function applyFixed(value: any, fixed: any, debug: ConsoleDebug): any {
  if (value === undefined) {
    debug('applyFixed', fixed);
    return fixed;
  }
  return value;
}

function applyPattern(value: any, pattern: any, debug: ConsoleDebug): any {
  try {
    const result = value === undefined ? undefined : deepClone(value);

    // { coding: [{ system: 'http://loinc.org', code: '8462-4' }] };

    if (Array.isArray(pattern)) {
      if (Array.isArray(result) || result === undefined || result === null) {
        const resultArr = (result ?? []) as any[];
        if (resultArr.length > 0) {
          throw new Error(
            'Cannot yet apply a pattern to a non-empty array since that would require cardinality checks'
          );
        }
        resultArr.push(...pattern);
        return resultArr;
      } else {
        throw new Error('Type of value incompatible with array pattern');
      }
    } else if (isObject(pattern)) {
      if (isObject(result) || result === undefined || result === null) {
        const resultObj = (result ?? Object.create(null)) as { [key: string]: any };
        for (const key of Object.keys(pattern)) {
          const output = applyPattern(resultObj[key], pattern[key], debug);
          debug(
            `object set ${key}`,
            JSON.stringify({ existing: resultObj[key] ?? null, pattern: pattern[key], output }, undefined, 2)
          );
          resultObj[key] = applyPattern(resultObj[key], pattern[key], debug);
        }
        return resultObj;
      } else {
        throw new Error('Type of value incompatible with object pattern');
      }
    }

    throw new Error('Unexpected type of pattern');
  } catch (ex) {
    return value;
  }
}
