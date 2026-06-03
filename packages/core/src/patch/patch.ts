/* eslint-disable header/header */
/*
 * Copyright © 2014-2021 Christopher Brown <io@henrian.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import type {
  AddOperation,
  CopyOperation,
  MoveOperation,
  Operation,
  RemoveOperation,
  ReplaceOperation,
  TestOperation,
} from './diff';
import { diffAny } from './diff';
import { Pointer } from './pointer';
import { clone, objectType } from './util';

export interface Options {
  /**
   * When true, "add" operations with path ending in "/-" will implicitly
   * create an empty array where possible.
   *
   * For example, with this option enabled, for the object `{live: true}`,
   * the operation `add "/tag/-" 123` will result in `{live: true, tag: [123]}`.
   * Subsequent operations behave normally: another `add "/tag/-" 456` will result
   * in `{live: true, tag: [123, 456]}`.
   *
   * If the indicated array property already exists but is not an array, this will
   * produce an error.
   *
   * Only the leaf array will be inferred; missing parent objects will still
   * produce errors.
   */
  implicitArrayCreation?: boolean;
}

export class MissingError extends Error {
  path: string;

  constructor(path: string) {
    super(`Value required at path: ${path}`);
    this.path = path;
    this.name = 'MissingError';
  }
}

export class TestError extends Error {
  actual: any;
  expected: any;

  constructor(actual: any, expected: any) {
    super(`Test failed: ${actual} != ${expected}`);
    this.actual = actual;
    this.expected = expected;
    this.name = 'TestError';
  }
}

function _add(object: any, key: string, value: any): void {
  if (Array.isArray(object)) {
    // `key` must be an index
    if (key === '-') {
      object.push(value);
    } else {
      const index = parseInt(key, 10);
      object.splice(index, 0, value);
    }
  } else {
    object[key] = value;
  }
}

function _remove(object: any, key: string): void {
  if (Array.isArray(object)) {
    // '-' syntax doesn't make sense when removing
    const index = parseInt(key, 10);
    object.splice(index, 1);
  } else {
    // not sure what the proper behavior is when path = ''
    delete object[key];
  }
}

/**
 * >  o  If the target location specifies an array index, a new value is
 * >     inserted into the array at the specified index.
 * >  o  If the target location specifies an object member that does not
 * >     already exist, a new member is added to the object.
 * >  o  If the target location specifies an object member that does exist,
 * >     that member's value is replaced.
 *
 * @param object - The object being patched.
 * @param operation - The operation to perform on the object.
 * @param options - Optional params.
 * @returns null on success, or error if one occurred.
 */
export function add(object: any, operation: AddOperation, options?: Options): MissingError | null {
  const pointer = Pointer.fromJSON(operation.path);
  // Handle implicit array creation for terminal "/-" paths
  if (options?.implicitArrayCreation && pointer.tokens[pointer.tokens.length - 1] === '-') {
    // Try to evaluate the parent (the array itself)
    const parentEndpoint = pointer.parent().evaluate(object);
    // If the array property doesn't exist but its parent does,
    // and this parent is a plain object (not an array),
    // create an (empty) array that we will add to below.
    if (parentEndpoint.value === undefined && objectType(parentEndpoint.parent) === 'object') {
      parentEndpoint.parent[parentEndpoint.key] = [];
    }
  }

  const endpoint = pointer.evaluate(object);
  // it's not exactly a "MissingError" in the same way that `remove` is -- more like a MissingParent, or something
  if (endpoint.parent === undefined) {
    return new MissingError(operation.path);
  }

  // When using implicitArrayCreation, validate that "/-" targets are actually arrays
  if (options?.implicitArrayCreation && endpoint.key === '-' && !Array.isArray(endpoint.parent)) {
    return new MissingError(operation.path);
  }

  _add(endpoint.parent, endpoint.key, clone(operation.value));
  return null;
}

/**
 * > The "remove" operation removes the value at the target location.
 * > The target location MUST exist for the operation to be successful.
 *
 * @param object - The object being patched.
 * @param operation - The operation to perform on the object.
 * @param _options - Optional params.
 * @returns null on success, or error if one occurred.
 */
export function remove(object: any, operation: RemoveOperation, _options?: Options): MissingError | null {
  // endpoint has parent, key, and value properties
  const endpoint = Pointer.fromJSON(operation.path).evaluate(object);
  if (endpoint.value === undefined) {
    return new MissingError(operation.path);
  }
  // not sure what the proper behavior is when path = ''
  _remove(endpoint.parent, endpoint.key);
  return null;
}

/**
 * > The "replace" operation replaces the value at the target location
 * > with a new value.  The operation object MUST contain a "value" member
 * > whose content specifies the replacement value.
 * > The target location MUST exist for the operation to be successful.
 *
 * > This operation is functionally identical to a "remove" operation for
 * > a value, followed immediately by an "add" operation at the same
 * > location with the replacement value.
 *
 * Even more simply, it's like the add operation with an existence check.
 *
 * @param object - The object being patched.
 * @param operation - The operation to perform on the object.
 * @param _options - Optional params.
 * @returns null on success, or error if one occurred.
 */
export function replace(object: any, operation: ReplaceOperation, _options?: Options): MissingError | null {
  const endpoint = Pointer.fromJSON(operation.path).evaluate(object);
  if (endpoint.parent === null) {
    return new MissingError(operation.path);
  }
  // this existence check treats arrays as a special case
  if (Array.isArray(endpoint.parent)) {
    if (parseInt(endpoint.key, 10) >= endpoint.parent.length) {
      return new MissingError(operation.path);
    }
  } else if (endpoint.value === undefined) {
    return new MissingError(operation.path);
  }
  endpoint.parent[endpoint.key] = clone(operation.value);
  return null;
}

/**
 * > The "move" operation removes the value at a specified location and
 * > adds it to the target location.
 * > The operation object MUST contain a "from" member, which is a string
 * > containing a JSON Pointer value that references the location in the
 * > target document to move the value from.
 * > This operation is functionally identical to a "remove" operation on
 * > the "from" location, followed immediately by an "add" operation at
 * > the target location with the value that was just removed.
 *
 * > The "from" location MUST NOT be a proper prefix of the "path"
 * > location; i.e., a location cannot be moved into one of its children.
 *
 * TODO: throw if the check described in the previous paragraph fails.
 *
 * @param object - The object being patched.
 * @param operation - The operation to perform on the object.
 * @param _options - Optional params.
 * @returns null on success, or error if one occurred.
 */
export function move(object: any, operation: MoveOperation, _options?: Options): MissingError | null {
  const from_endpoint = Pointer.fromJSON(operation.from).evaluate(object);
  if (from_endpoint.value === undefined) {
    return new MissingError(operation.from);
  }
  const endpoint = Pointer.fromJSON(operation.path).evaluate(object);
  if (endpoint.parent === undefined) {
    return new MissingError(operation.path);
  }
  _remove(from_endpoint.parent, from_endpoint.key);
  _add(endpoint.parent, endpoint.key, from_endpoint.value);
  return null;
}

/**
 * > The "copy" operation copies the value at a specified location to the
 * > target location.
 * > The operation object MUST contain a "from" member, which is a string
 * > containing a JSON Pointer value that references the location in the
 * > target document to copy the value from.
 * > The "from" location MUST exist for the operation to be successful.
 *
 * > This operation is functionally identical to an "add" operation at the
 * > target location using the value specified in the "from" member.
 *
 * Alternatively, it's like 'move' without the 'remove'.
 *
 * @param object - The object being patched.
 * @param operation - The operation to perform on the object.
 * @param _options - Optional params.
 * @returns null on success, or error if one occurred.
 */
export function copy(object: any, operation: CopyOperation, _options?: Options): MissingError | null {
  const from_endpoint = Pointer.fromJSON(operation.from).evaluate(object);
  if (from_endpoint.value === undefined) {
    return new MissingError(operation.from);
  }
  const endpoint = Pointer.fromJSON(operation.path).evaluate(object);
  if (endpoint.parent === undefined) {
    return new MissingError(operation.path);
  }
  _add(endpoint.parent, endpoint.key, clone(from_endpoint.value));
  return null;
}

/**
 * > The "test" operation tests that a value at the target location is
 * > equal to a specified value.
 * > The operation object MUST contain a "value" member that conveys the
 * > value to be compared to the target location's value.
 * > The target location MUST be equal to the "value" value for the
 * > operation to be considered successful.
 *
 * @param object - The object being patched.
 * @param operation - The add operation to perform on the object.
 * @param _options - Optional params.
 * @returns null on success, or error if one occurred.
 */
export function test(object: any, operation: TestOperation, _options?: Options): TestError | null {
  const endpoint = Pointer.fromJSON(operation.path).evaluate(object);
  // TODO: this diffAny(...).length usage could/should be lazy
  if (diffAny(endpoint.value, operation.value, new Pointer()).length) {
    return new TestError(endpoint.value, operation.value);
  }
  return null;
}

export class InvalidOperationError extends Error {
  operation: Operation;

  constructor(operation: Operation) {
    super(`Invalid operation: ${operation.op}`);
    this.operation = operation;
    this.name = 'InvalidOperationError';
  }
}

/**
 * Switch on `operation.op`, applying the corresponding patch function for each
 * case to `object`.
 *
 * @param object - The object being patched.
 * @param operation - The operation to perform on the object.
 * @param options - Optional params.
 * @returns null on success, or error if one occurred.
 */
export function apply(
  object: any,
  operation: Operation,
  options?: Options
): MissingError | InvalidOperationError | TestError | null {
  switch (operation.op) {
    case 'add':
      return add(object, operation, options);
    case 'remove':
      return remove(object, operation, options);
    case 'replace':
      return replace(object, operation, options);
    case 'move':
      return move(object, operation, options);
    case 'copy':
      return copy(object, operation, options);
    case 'test':
      return test(object, operation, options);
    default:
      return new InvalidOperationError(operation);
  }
}
