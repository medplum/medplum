import { InternalSchemaElement, InternalTypeSchema } from '@medplum/core';
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

export type FlatWalkedPaths = {
  [path: string]: InternalSchemaElement;
};

export type BackboneElementContextType = {
  debugMode: boolean;
  profileUrl: string | undefined;
  /**
   * Get the element definition for the specified path if it has been modified by a profile.
   * @param nestedElementPath - The path of the nested element
   * @returns The modified element definition if it has been modified by the active profile or undefined. If undefined,
   * the element has the default definition for the given type.
   */
  getModifiedNestedElement: (nestedElementPath: string) => InternalSchemaElement | undefined;
};

export const BackboneElementContext = React.createContext<BackboneElementContextType>({
  profileUrl: undefined,
  debugMode: false,
  getModifiedNestedElement: () => undefined,
});

export function buildBackboneElementContext(
  typeSchema: InternalTypeSchema | undefined,
  profileUrl?: string | undefined,
  debugMode?: boolean | undefined
): BackboneElementContextType {
  const nestedPaths: FlatWalkedPaths = Object.create(null);

  function getModifiedNestedElement(nestedElementPath: string): InternalSchemaElement | undefined {
    return nestedPaths[nestedElementPath];
  }

  const elements = typeSchema?.elements;
  if (elements) {
    const seenKeys = new Set<string>();
    for (const [key, property] of Object.entries(elements)) {
      const [beginning, _last] = splitOnceRight(key, '.');
      // assume paths are hierarchically sorted, e.g. identifier comes before identifier.id
      if (seenKeys.has(beginning)) {
        nestedPaths[typeSchema.type + '.' + key] = property;
      }
      seenKeys.add(key);
    }
  }

  return { debugMode: debugMode ?? false, profileUrl, getModifiedNestedElement };
}
