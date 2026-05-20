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

interface PathedObject {
  [PATH_SYMBOL]: string;
}
export type WithPath<T extends object> = T & PathedObject;

/**
 * Returns a clone of an object annotated with a path.
 *
 * The path is stored under a special Symbol key which is not yielded during
 * normal iteration. You can retrieve it using the `getPath` helper.
 *
 * @param obj - The object to annotate
 * @param path - The path to annotate the object with
 * @returns A shallow clone of the object including the path
 */
export function withPath<T extends object>(obj: T, path: string): WithPath<T> {
  return { ...obj, [PATH_SYMBOL]: path };
}

/**
 * Gets the path from an annotated object
 *
 * @param obj - The object to retrieve the annotation from
 * @returns The path string assigned to the object
 */
export function getPath(obj: PathedObject): string;
export function getPath(obj: object): undefined;
export function getPath(obj: { [PATH_SYMBOL]?: string }): string | undefined {
  if (PATH_SYMBOL in obj) {
    return obj[PATH_SYMBOL];
  }
  return undefined;
}

/**
 * Copies an array, annotating each entry with a path suffixed with
 * array-index bracket notation.
 *
 * @example
 * ```typescript
 *   const actors = withPaths(schedule.actor, 'Schedule.actor');
 *   assert(getPath(actors[0]) === 'Schedule.actor[0]'):
 *   assert(getPath(actors[1]) === 'Schedule.actor[1]'):
 * ```
 *
 * @param objects - An array of objects to annotate
 * @param pathPrefix - A string to use as the base for path construction
 * @returns An array with each element annotated via `withPath`
 */
export function withPaths<T extends object>(objects: readonly T[], pathPrefix: string): WithPath<T>[] {
  return objects.map((obj, idx) => withPath(obj, `${pathPrefix}[${idx}]`));
}

/**
 *
 *
 * Like `withPaths(objects, pathPrefix).filter(predicate)`, but avoids
 * intermediate allocations for objects that don't match the predicate.
 *
 * @example
 * ```typescript
 *   const schedule = {
 *     actor: [
 *       { reference: 'Practitioner/123' },
 *       { reference: 'Location/abc' },
 *       { reference: 'Practitioner/456' },
 *     ]
 *   }
 *   const actors = filterWithPaths(
 *     schedule.actor,
 *     (actor) => isReference(actor, 'Practitioner'),
 *     'Schedule.actor'
 *   );
 *   assert(getPath(actors[0]) === 'Schedule.actor[0]');
 *   // `Schedule.actor[1]` was of the wrong type and omitted
 *   assert(getPath(actors[1]) === 'Schedule.actor[2]');
 * ```
 *
 * @param objects - An array of objects to filter and annotate
 * @param predicate - A function to test each object with
 * @param pathPrefix - A string to use as the base for path construction
 * @returns An array of objects matching the predicate, annotated with their original index
 */
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

/**
 * Performs element-wise copying of path annotations from entries in a sources
 * array to objects in a destinations array.
 *
 * @example
 * ```typescript
 *   // start with an array of pathed objects
 *   const slots: WithPath<Slot>[] = [...];
 *
 *   // do something that generates a new array of related objects
 *   const schedules = await ctx.repo.readReferences(slots.map(slot => slot.schedule))
 *
 *   // copy the path information to the new objects
 *   const pathedSchedules = copyPaths(slots, schedules, { suffix: '.schedule' })
 * ```
 *
 * @param sources - The objects to copy paths from
 * @param destinations - The objects to copy paths to
 * @param options - Optional options
 * @param options.suffix - A path suffix to append when copying
 * @returns A copy of the destinations array annotated with paths
 */
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
