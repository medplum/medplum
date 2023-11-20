import { InternalSchemaElement } from '@medplum/core';
import React from 'react';

const PROPERTY = Symbol('property'); // Use a symbol to avoid collisions with 'property' appearing in a path

export function splitRight(str: string, delim: string): [string, string] {
  const lastIndex = str.lastIndexOf(delim);
  const beginning = str.substring(0, lastIndex);
  const last = str.substring(lastIndex + 1, str.length);

  return [beginning, last];
}

export type WalkedPaths = {
  [key: string]: WalkedPaths | { [PROPERTY]: InternalSchemaElement };
};

export type BackboneElementContextType = {
  walkedPaths: WalkedPaths;
  seenKeys: Set<string>;
};

export const BackboneElementContext = React.createContext<BackboneElementContextType>({
  walkedPaths: {},
  seenKeys: new Set(),
});

export function buildWalkedPathsAndSeenKeys(
  elements: Record<string, InternalSchemaElement> | undefined
): [BackboneElementContextType['walkedPaths'], BackboneElementContextType['seenKeys']] {
  const result: WalkedPaths = {};
  const seenKeys = new Set<string>();
  if (!elements) {
    return [result, seenKeys];
  }

  for (const [key, property] of Object.entries(elements)) {
    const [beginning, last] = splitRight(key, '.');
    console.debug({ key, beginning, last, property });

    // assumes paths are hierarchically sorted, e.g. Patient.identifier comes before Patient.identifier.id
    if (seenKeys.has(beginning)) {
      let entry: WalkedPaths | undefined = result[beginning];
      if (entry === undefined) {
        entry = {};
        result[beginning] = entry;
      }
      entry[last] = { [PROPERTY]: property };
    }
    seenKeys.add(key);
  }
  return [result, seenKeys];
}
