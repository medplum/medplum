// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { flatMapFilter } from '@medplum/core';

/**
 * Utilities for tracking paths through manipulations
 *
 * Path information is annotated onto objects with a unique symbol
 * key, allowing us to read/write path information into the JS objects
 * in a way that is not revealed during normal iteration.
 */
const PATH_SYMBOL = Symbol('MedplumPath');

type PathedObject = { [PATH_SYMBOL]: string };
export type WithPath<T extends object> = T & PathedObject;

// Returns a clone of an object annotated with a path
export function withPath<T extends object>(obj: T, path: string): WithPath<T> {
  return { ...obj, [PATH_SYMBOL]: path };
}

// Gets the path from an annotated object
export function getPath(obj: PathedObject): string;
export function getPath(obj: object): undefined;
export function getPath(obj: { [PATH_SYMBOL]?: string }): string | undefined {
  if (PATH_SYMBOL in obj) {
    return obj[PATH_SYMBOL];
  }
  return undefined;
}

// Clones each entry in an array and adds a path with an array-index notation
// component appended.
export function withPaths<T extends object>(objects: readonly T[], pathPrefix: string): WithPath<T>[] {
  return objects.map((obj, idx) => withPath(obj, `${pathPrefix}[${idx}]`));
}

// Like `withPaths(objects, pathPrefix).filter(predicate)`, but avoids
// intermediate allocations for objects that don't match the predicate.
export function filterWithPaths<T extends object, U extends T>(
  objects: T[] | undefined,
  predicate: (obj: T) => obj is U,
  pathPrefix: string
): WithPath<U>[];
export function filterWithPaths<T extends object>(
  objects: T[] | undefined,
  predicate: (obj: T) => boolean,
  pathPrefix: string
): WithPath<T>[];
export function filterWithPaths<T extends object>(
  objects: T[] | undefined,
  predicate: (obj: T) => boolean,
  pathPrefix: string
): WithPath<T>[] {
  return flatMapFilter(objects, (obj, idx) => {
    if (predicate(obj)) {
      return withPath(obj, `${pathPrefix}[${idx}]`);
    }
    return undefined;
  });
}

// Copies paths from a source array to objects in the destinations array
export function copyPaths<T extends object, U extends object>(
  sources: WithPath<U>[],
  destinations: T[],
  options?: { suffix: string }
): WithPath<T>[] {
  if (sources.length !== destinations.length) {
    throw new Error(`copyPaths length mismatch`);
  }
  const suffix = options?.suffix ?? '';
  return destinations.map((obj, idx) => {
    const path = getPath(sources[idx]);
    return withPath(obj, `${path}${suffix}`);
  });
}
