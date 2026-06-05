// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Pointer } from '../patch';
import type { Options } from '../patch/patch';
import { add, move, remove, replace } from '../patch/patch';
import type { TypedValue } from '../types';
import { getElementDefinitionForPath } from '../types';
import type { TypedValueWithPath } from '../typeschema/crawler';
import { pathToJSONPointer } from '../typeschema/crawler';
import { isObject } from '../utils';
import { evalFhirPathTyped } from './parse';

export type FhirPathPatch =
  | { type: 'add'; path: string; name: string; value: TypedValue }
  | { type: 'insert'; path: string; value: TypedValue; index: number }
  | { type: 'delete'; path: string }
  | { type: 'replace'; path: string; value: TypedValue }
  | { type: 'move'; path: string; source: number; destination: number };

const ADD_OPTIONS: Readonly<Options> = Object.freeze({ implicitArrayCreation: true });

export function fhirpathPatchTypedValue(original: TypedValue, patch: FhirPathPatch[]): void {
  for (const op of patch) {
    const results = evalFhirPathTyped(op.path, [original]);
    switch (op.type) {
      case 'add': {
        const base = getSingleValue(results, op);
        if (!isObject(base?.value)) {
          throw new Error(`Failed to resolve base object for add operation at path '${op.path}'`);
        }
        assertPath(base, op);
        if (!op.name) {
          throw new Error(`No name present for add operation at path '${op.path}'`);
        }

        // Construct pointer to location at which to add the value
        const ptr = Pointer.fromJSON(pathToJSONPointer(base.path));
        ptr.push(op.name);
        const element = getElementDefinitionForPath(original.type, `${base.path}.${op.name}`);
        if (element?.isArray) {
          // Append to end of array
          ptr.push('-');
        }

        add(original.value, { op: 'add', path: ptr.toString(), value: op.value.value }, ADD_OPTIONS);
        break;
      }
      case 'replace': {
        const target = getSingleValue(results, op);
        if (!target) {
          throw new Error(`Failed to resolve target value for replace operation at path '${op.path}'`);
        }
        assertPath(target, op);

        replace(original.value, { op: 'replace', path: pathToJSONPointer(target.path), value: op.value.value });
        break;
      }
      case 'move': {
        const basePath = assertCollectionBasePath(results, op);
        const ptr = Pointer.fromJSON(pathToJSONPointer(basePath));

        move(original.value, {
          op: 'move',
          from: ptr.add(op.source.toString()).toString(),
          path: ptr.add(op.destination.toString()).toString(),
        });
        break;
      }
      case 'insert': {
        const basePath = assertCollectionBasePath(results, op);
        // Construct pointer to array index
        const ptr = Pointer.fromJSON(pathToJSONPointer(basePath));
        ptr.push(op.index.toString());

        add(original.value, { op: 'add', path: ptr.toString(), value: op.value.value });
        break;
      }
      case 'delete': {
        const target = getSingleValue(results, op);
        if (target) {
          assertPath(target, op);
          remove(original.value, { op: 'remove', path: pathToJSONPointer(target.path) });
        }
      }
    }
  }
}

function assertPath(value: TypedValue, op: FhirPathPatch): asserts value is TypedValueWithPath {
  if (!('path' in value)) {
    throw new Error(`Cannot resolve pointer for value at path '${op.path}'`);
  }
}

function getSingleValue(collection: TypedValue[], op: FhirPathPatch): TypedValue | undefined {
  if (collection.length > 1) {
    throw new Error(`Resolved multiple base values for ${op.type} operation at path '${op.path}'`);
  }
  return collection[0];
}

const terminalIndexRegex = /\[(?<index>\d+)\]$/;
function getTerminalIndex(path: string): number {
  const index = terminalIndexRegex.exec(path)?.groups?.['index'];
  return index ? Number.parseInt(index, 10) : -1;
}

function assertCollectionBasePath(collection: TypedValue[], op: FhirPathPatch): string {
  if (getTerminalIndex(op.path) !== -1) {
    // Path should specify the collection, not a specific element
    throw new Error(`Failed to resolve base collection for ${op.type} operation at path '${op.path}'`);
  }
  if (!collection.length) {
    // FHIR JSON does not permit empty arrays, so this could not occur naturally in a resource
    throw new Error(`Failed to resolve base for ${op.type} operation at path '${op.path}'`);
  }

  assertPath(collection[0], op);

  // Assert first element
  const path = collection[0].path;
  if (getTerminalIndex(path) !== 0) {
    throw new Error(`Failed to resolve base collection for ${op.type} operation at path '${op.path}'`);
  }
  // First element sets the base path
  const basePath = path.slice(0, path.lastIndexOf('['));

  for (let i = 1; i < collection.length; i++) {
    // All elements should follow sequentially under the base path
    const item = collection[i];
    assertPath(item, op);

    if (!item.path.startsWith(basePath)) {
      throw new Error(`Cannot patch heterogeneous collection for ${op.type} operation at path '${op.path}'`);
    }
    if (getTerminalIndex(item.path) !== i) {
      throw new Error(`Cannot patch misordered collection for ${op.type} operation at path '${op.path}'`);
    }
  }

  // Validate that indices are valid with the collection at this path
  if ('index' in op && !isValidIndex(op.index, collection)) {
    throw new Error(`Index out of bounds for ${op.type} operation: ${op.index}`);
  }
  if ('source' in op && !isValidIndex(op.source, collection)) {
    throw new Error(`Source index out of bounds for ${op.type} operation: ${op.source}`);
  }
  if ('destination' in op && !isValidIndex(op.destination, collection)) {
    throw new Error(`Destination index out of bounds for ${op.type} operation: ${op.destination}`);
  }
  return basePath;
}

function isValidIndex(index: number, collection: TypedValue[]): boolean {
  return index >= 0 && index <= collection.length;
}
