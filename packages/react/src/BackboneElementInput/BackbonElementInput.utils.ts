import { InternalSchemaElement, InternalTypeSchema, tryGetDataType } from '@medplum/core';
import React from 'react';

const PROPERTY = Symbol('property'); // Use a symbol to avoid collisions with 'property' appearing in a path

export function splitRight(str: string, delim: string): [string, string] {
  const lastIndex = str.lastIndexOf(delim);
  const beginning = str.substring(0, lastIndex);
  const last = str.substring(lastIndex + 1, str.length);

  return [beginning, last];
}

export type NestedWalkedPaths = {
  [key: string]: NestedWalkedPaths | { [PROPERTY]: InternalSchemaElement };
};

export type FlatWalkedPaths = {
  [path: string]: InternalSchemaElement;
};

export type BackboneElementContextType = {
  debugMode: boolean;
  walkedPathsNested: NestedWalkedPaths;
  walkedPathsFlat: FlatWalkedPaths;
  seenKeys: Set<string>;
  getNestedElement: (InternalSchemaElement: InternalSchemaElement, name: string) => InternalSchemaElement | undefined;
  // getElementByPath: (path: string) => InternalSchemaElement | undefined;
};

export const BackboneElementContext = React.createContext<BackboneElementContextType>({
  debugMode: false,
  walkedPathsNested: Object.create(null),
  walkedPathsFlat: Object.create(null),
  seenKeys: new Set(),
  getNestedElement: () => undefined,
  // getElementByPath: () => undefined,
});

export function buildBackboneElementContext(
  typeSchema: InternalTypeSchema | undefined,
  // TODO{mattlong} correctly handle nested calls to buildBackboneElementContext
  _previousElements: FlatWalkedPaths[],
  debugMode: boolean = false
): BackboneElementContextType {
  const walkedPathsNested: NestedWalkedPaths = Object.create(null);
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

  const context = { debugMode, walkedPathsNested, walkedPathsFlat, seenKeys, getNestedElement };

  const elements = typeSchema?.elements;
  if (!elements) {
    return context;
  }

  for (const [key, property] of Object.entries(elements)) {
    const [beginning, last] = splitRight(key, '.');
    // assumes paths are hierarchically sorted, e.g. Patient.identifier comes before Patient.identifier.id
    if (seenKeys.has(beginning)) {
      let entry: NestedWalkedPaths | undefined = walkedPathsNested[beginning];
      if (entry === undefined) {
        entry = {};
        walkedPathsNested[beginning] = entry;
      }
      entry[last] = { [PROPERTY]: property };

      walkedPathsFlat[typeSchema.type + '.' + key] = property;
    }
    seenKeys.add(key);
  }
  return context;
}
