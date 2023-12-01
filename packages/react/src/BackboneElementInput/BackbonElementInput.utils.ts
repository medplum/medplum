import { InternalSchemaElement, InternalTypeSchema, tryGetDataType } from '@medplum/core';
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
  profileUrl: string | undefined;
  debugMode: boolean;
  walkedPathsFlat: FlatWalkedPaths;
  seenKeys: Set<string>;
  getNestedElement: (InternalSchemaElement: InternalSchemaElement, name: string) => InternalSchemaElement | undefined;
  // getElementByPath: (path: string) => InternalSchemaElement | undefined;
};

export const BackboneElementContext = React.createContext<BackboneElementContextType>({
  profileUrl: undefined,
  debugMode: false,
  walkedPathsFlat: Object.create(null),
  seenKeys: new Set(),
  getNestedElement: () => undefined,
  // getElementByPath: () => undefined,
});

export function buildBackboneElementContext(
  typeSchema: InternalTypeSchema | undefined,
  profileUrl: string | undefined,
  // TODO{mattlong} correctly handle nested calls to buildBackboneElementContext
  _previousElements: FlatWalkedPaths[],
  debugMode: boolean = false
): BackboneElementContextType {
  const walkedPathsFlat: FlatWalkedPaths = Object.create(null);
  const seenKeys = new Set<string>();

  // function getElementByPath(path: string): InternalSchemaElement | undefined {
  //   for (const walkedPaths of previousElements) {
  //     const elem = walkedPaths[path];
  //     if (elem) {
  //       return elem;
  //     }
  //   }
  //   return walkedPathsFlat[path];
  // }

  function getNestedElement(parentProperty: InternalSchemaElement, name: string): InternalSchemaElement | undefined {
    return (
      walkedPathsFlat[parentProperty.path + '.' + name] ??
      tryGetDataType(parentProperty.type?.[0].code)?.elements?.[name]
    );
  }

  const context = { debugMode, profileUrl, walkedPathsFlat, seenKeys, getNestedElement };

  const elements = typeSchema?.elements;
  if (!elements) {
    return context;
  }

  for (const [key, property] of Object.entries(elements)) {
    const [beginning, _last] = splitRight(key, '.');
    // assumes paths are hierarchically sorted, e.g. Patient.identifier comes before Patient.identifier.id
    if (seenKeys.has(beginning)) {
      walkedPathsFlat[typeSchema.type + '.' + key] = property;
    }
    seenKeys.add(key);
  }
  return context;
}
