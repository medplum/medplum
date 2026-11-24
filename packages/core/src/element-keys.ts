// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { PropertyType } from './types';

/*
 * In FHIR JSON, the `id` and `extension` of a primitive element are stored separately from its value,
 * under the same key prefixed with "_" (e.g. `birthDate` and `_birthDate`).
 * These helpers treat both keys as one element.
 */

const CHOICE_SUFFIX = '[x]';

/**
 * The name of an element of `T`, or a choice-of-type element name (e.g. `value[x]`).
 */
export type ElementName<T> = Extract<keyof T, string> | `${string}[x]`;

/**
 * Returns the element name held by a JSON key, without the primitive extension "_" prefix.
 * @param key - The JSON key, e.g. `_birthDate`.
 * @returns The element name, e.g. `birthDate`.
 */
export function getElementName(key: string): string {
  return key.startsWith('_') ? key.slice(1) : key;
}

/**
 * Returns the JSON key that holds the primitive id and extensions of the element.
 * @param name - The element name, e.g. `birthDate`.
 * @returns The primitive extension key, e.g. `_birthDate`.
 */
export function getPrimitiveExtensionKey(name: string): string {
  return '_' + name;
}

/**
 * Returns the other JSON key of the same element: the primitive extension key for a value key, and vice versa.
 * @param key - The JSON key, e.g. `birthDate` or `_birthDate`.
 * @returns The paired key, e.g. `_birthDate` or `birthDate`.
 */
export function getPairedElementKey(key: string): string {
  return key.startsWith('_') ? key.slice(1) : getPrimitiveExtensionKey(key);
}

/**
 * Returns true if the JSON key holds the element: its value (`birthDate`) or its primitive id and extensions (`_birthDate`).
 * @param key - The JSON key.
 * @param name - The element name, which may be a choice of type (e.g. `value[x]` matches `valueString` and `_valueString`).
 * @returns True if the key holds the element.
 */
export function isElementKey(key: string, name: string): boolean {
  const elementName = getElementName(key);
  if (!name.endsWith(CHOICE_SUFFIX)) {
    return elementName === name;
  }
  const baseName = name.slice(0, -CHOICE_SUFFIX.length);
  if (!elementName.startsWith(baseName)) {
    return false;
  }
  const type = elementName.slice(baseName.length);
  const first = type.charCodeAt(0);
  // FHIR JSON capitalizes the type suffix (e.g. `valueString`)
  if (!(first >= 65 && first <= 90)) {
    return false;
  }
  return Object.hasOwn(PropertyType, type) || Object.hasOwn(PropertyType, type.charAt(0).toLowerCase() + type.slice(1));
}

/**
 * Returns the keys of the object that hold the element, including primitive extension keys.
 * @param obj - The object containing the element.
 * @param name - The element name, which may be a choice of type (e.g. `value[x]`).
 * @returns The keys with a defined value that hold the element.
 */
export function getElementKeys<T extends object>(obj: T, name: NoInfer<ElementName<T>>): string[] {
  const record = obj as Record<string, unknown>;
  if (!name.endsWith(CHOICE_SUFFIX)) {
    const keys: string[] = [];
    const extensionKey = getPrimitiveExtensionKey(name);
    if (record[name] !== undefined) {
      keys.push(name);
    }
    if (record[extensionKey] !== undefined) {
      keys.push(extensionKey);
    }
    return keys;
  }
  return Object.keys(record).filter((key) => record[key] !== undefined && isElementKey(key, name));
}

/**
 * Deletes the element from the object, including its primitive id and extensions.
 * Keys are deleted even if their value is `undefined`.
 * @param obj - The object containing the element.
 * @param name - The element name, which may be a choice of type (e.g. `value[x]`).
 */
export function deleteElement<T extends object>(obj: T, name: NoInfer<ElementName<T>>): void {
  const record = obj as Record<string, unknown>;
  if (!name.endsWith(CHOICE_SUFFIX)) {
    delete record[name];
    delete record[getPrimitiveExtensionKey(name)];
    return;
  }
  for (const key of Object.keys(record)) {
    if (isElementKey(key, name)) {
      delete record[key];
    }
  }
}

/**
 * Replaces the element on the target with the element on the source, including its primitive id and extensions.
 * If the source does not have the element, then it is removed from the target.
 * @param target - The object to modify.
 * @param source - The object to copy the element from.
 * @param name - The element name, which may be a choice of type (e.g. `value[x]`).
 */
export function copyElement<T extends object>(target: T, source: T | undefined, name: NoInfer<ElementName<T>>): void {
  deleteElement(target, name);
  if (source) {
    const sourceRecord = source as Record<string, unknown>;
    for (const key of getElementKeys(source, name)) {
      (target as Record<string, unknown>)[key] = sourceRecord[key];
    }
  }
}
