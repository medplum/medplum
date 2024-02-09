import { InternalSchemaElement, InternalTypeSchema, getPathDifference } from '@medplum/core';
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
  path: string;
  profileUrl: string | undefined;
  /**
   * Get the element definition for the specified path if it has been modified by a profile.
   * @param nestedElementPath - The path of the nested element
   * @returns The modified element definition if it has been modified by the active profile or undefined. If undefined,
   * the element has the default definition for the given type.
   */
  getModifiedNestedElement: (nestedElementPath: string) => InternalSchemaElement | undefined;
  elements: Record<string, InternalSchemaElement>;
  elementsByPath: Record<string, InternalSchemaElement>;
  debugMode: boolean;
};

export const ElementsContext = React.createContext<ElementsContextType>({
  path: '',
  profileUrl: undefined,
  getModifiedNestedElement: () => undefined,
  elements: Object.create(null),
  elementsByPath: Object.create(null),
  debugMode: false,
});
ElementsContext.displayName = 'ElementsContext';

export function buildElementsContext({
  parentContext,
  elements,
  path,
  parentType,
  profileUrl,
  debugMode,
}: {
  elements: InternalTypeSchema['elements'];
  path: string;
  parentContext: ElementsContextType | undefined;
  parentType: string | undefined;
  profileUrl?: string;
  debugMode?: boolean;
}): ElementsContextType | undefined {
  if (debugMode) {
    console.debug('Building ElementsContext', { path, profileUrl, elements });
  }

  if (path === parentContext?.path) {
    return undefined;
  }

  const mergedElements: ElementsContextType['elements'] = mergeElementsForContext(
    path,
    elements,
    parentContext,
    Boolean(debugMode)
  );

  const nestedPaths: Record<string, InternalSchemaElement> = Object.create(null);
  const elementsByPath: ElementsContextType['elementsByPath'] = Object.create(null);

  const seenKeys = new Set<string>();
  for (const [key, property] of Object.entries(mergedElements)) {
    elementsByPath[path + '.' + key] = property;

    const [beginning, _last] = splitOnceRight(key, '.');
    // assume paths are hierarchically sorted, e.g. identifier comes before identifier.id
    if (seenKeys.has(beginning)) {
      nestedPaths[parentType + '.' + key] = property;
    }
    seenKeys.add(key);
  }

  function getModifiedNestedElement(nestedElementPath: string): InternalSchemaElement | undefined {
    return nestedPaths[nestedElementPath];
  }

  return {
    path: path,
    debugMode: debugMode ?? parentContext?.debugMode ?? false,
    profileUrl: profileUrl ?? parentContext?.profileUrl,
    getModifiedNestedElement,
    elements: mergedElements,
    elementsByPath,
  };
}

function mergeElementsForContext(
  path: string,
  elements: InternalTypeSchema['elements'] | undefined,
  parentContext: ElementsContextType | undefined,
  debugMode: boolean
): ElementsContextType['elements'] {
  const result: ElementsContextType['elements'] = Object.create(null);

  if (debugMode) {
    console.log('Merging elements for context', {
      path,
      elements,
      parentPath: parentContext?.path,
      parentElements: parentContext?.elementsByPath,
    });
  }
  if (parentContext) {
    for (const [path, element] of Object.entries(parentContext.elementsByPath)) {
      const key = getPathDifference(path, path);
      if (key !== undefined) {
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

  // if no new elements are used, the ElementsContext is unnecessary.
  // We could add another guard against unnecessary contexts if usedNewElements is false,
  // but unnecessary contexts **should** already be taken care before
  // this function is called. Leaving the debug logging in for now.
  if (debugMode && !usedNewElements) {
    console.debug('Unnecessary ElementsContext; not using any newly provided elements');
  }
  return result;
}
