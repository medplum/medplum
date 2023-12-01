import { InternalSchemaElement, InternalTypeSchema } from '@medplum/core';
import React from 'react';

export function splitRight(str: string, delim: string): [string, string] {
  const lastIndex = str.lastIndexOf(delim);
  const beginning = str.substring(0, lastIndex);
  const last = str.substring(lastIndex + 1, str.length);

  return [beginning, last];
}

export type FlatWalkedPaths = {
  [path: string]: InternalSchemaElement;
};

export type BackboneElementContextType = {
  debugMode: boolean;
  profileUrl: string | undefined;
  getNestedElement: (parentPath: string, name: string) => InternalSchemaElement | undefined;
};

export const BackboneElementContext = React.createContext<BackboneElementContextType>({
  profileUrl: undefined,
  debugMode: false,
  getNestedElement: () => undefined,
});

export function buildBackboneElementContext(
  typeSchema: InternalTypeSchema | undefined,
  profileUrl: string | undefined,
  debugMode?: boolean
): BackboneElementContextType {
  const nestedPaths: FlatWalkedPaths = Object.create(null);

  function getNestedElement(parentPath: string, name: string): InternalSchemaElement | undefined {
    if (!nestedPaths[parentPath + '.' + name]) {
      console.log('nested element not found', parentPath, name);
    }
    return nestedPaths[parentPath + '.' + name];
  }

  const elements = typeSchema?.elements;
  if (elements) {
    const seenKeys = new Set<string>();
    for (const [key, property] of Object.entries(elements)) {
      const [beginning, _last] = splitRight(key, '.');
      // assume paths are hierarchically sorted, e.g. Patient.identifier comes before Patient.identifier.id
      if (seenKeys.has(beginning)) {
        nestedPaths[typeSchema.type + '.' + key] = property;
      }
      seenKeys.add(key);
    }
  }

  return { debugMode: debugMode ?? false, profileUrl, getNestedElement };
}
