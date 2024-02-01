import { InternalSchemaElement, InternalTypeSchema, TypedValue } from '@medplum/core';
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
  fixedProperties: { [key: string]: InternalSchemaElement & { fixed: TypedValue } };
};

export const ElementsContext = React.createContext<ElementsContextType>({
  profileUrl: undefined,
  debugMode: false,
  getModifiedNestedElement: () => undefined,
  getElementByPath: () => undefined,
  elements: Object.create(null),
  elementsByPath: Object.create(null),
  fixedProperties: Object.create(null),
});
ElementsContext.displayName = 'ElementsContext';

export type BuildElementsContextArgs = {
  elements: InternalTypeSchema['elements'] | undefined;
  parentPath: string;
  parentContext: ElementsContextType | undefined;
  parentType: string | undefined;
  profileUrl?: string;
  debugMode?: boolean;
};

function hasFixed(element: InternalSchemaElement): element is InternalSchemaElement & { fixed: TypedValue } {
  return Boolean(element.fixed);
}

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
  const fixedProperties: ElementsContextType['fixedProperties'] = Object.create(null);

  const seenKeys = new Set<string>();
  for (const [key, property] of Object.entries(mergedElements)) {
    elementsByPath[parentPath + '.' + key] = property;

    if (hasFixed(property)) {
      fixedProperties[key] = property;
    }

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

  return {
    debugMode: debugMode ?? parentContext?.debugMode ?? false,
    profileUrl: profileUrl ?? parentContext?.profileUrl,
    getModifiedNestedElement,
    getElementByPath,
    elements: mergedElements,
    elementsByPath,
    fixedProperties,
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
