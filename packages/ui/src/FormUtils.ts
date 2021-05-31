import { PropertySchema, Resource, TypeSchema } from '@medplum/core';

const KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const KEY_LENGTH = 6;

/**
 * Generates a short unique key that can be used for local identifiers.
 * @return A unique 6-character key.
 */
export function generateKey(): string {
  let result = '';
  for (let i = 0; i < KEY_LENGTH; i++) {
    result += KEY_CHARS.charAt(Math.floor(Math.random() * KEY_CHARS.length));
  }
  return result;
}

/**
 * Ensures that all elements in the array have a __key property.
 * @param array Input array of objects.
 * @return Updated array where all items have a __key property.
 */
export function ensureKeys<T>(array: T[] | undefined): T[] {
  if (!array) {
    return [];
  }

  array.forEach(obj => {
    if (typeof obj === 'object') {
      const objAsAny = obj as any;
      if (!objAsAny.__key) {
        objAsAny.__key = generateKey();
      }
    }
  });

  return array;
}

/**
 * Replaces any key/value pair of key "__key" with value undefined.
 * This function can be used as the 2nd argument to JSON.stringify to remove __key properties.
 * We add __key properties to array elements to improve React render performance.
 * @param {string} k Property key.
 * @param {*} v Property value.
 */
export function keyReplacer(k: string, v: string) {
  return k === '__key' ? undefined : v;
}

/**
 * Parses an HTML form and returns the result as a JavaScript object.
 * @param form The HTML form element.
 */
export function parseForm(form: HTMLFormElement): Record<string, string> {
  if (!form || !form.elements) {
    throw new Error('Invalid form');
  }

  const result: Record<string, string> = {};

  for (let i = 0; i < form.elements.length; i++) {
    const element = form.elements[i] as HTMLElement;

    if (element instanceof HTMLInputElement) {
      if (element.disabled) {
        // Ignore disabled elements
        continue;
      }

      if ((element.type === 'checkbox' || element.type === 'radio') && !element.checked) {
        // Ignore unchecked radio or checkbox elements
        continue;
      }

      result[element.name] = element.value;

    } else if (element instanceof HTMLTextAreaElement) {
      result[element.name] = element.value;

    } else if (element instanceof HTMLSelectElement) {
      if (element.selectedOptions.length === 0) {
        // Ignore select elements with no value
        continue;
      }

      result[element.name] = element.value;
    }
  }

  return result;
}

/**
 * Parses an HTML form and returns the result as a JavaScript object.
 * @param form The HTML form element.
 */
export function parseResourceForm(
  typeSchema: TypeSchema,
  form: HTMLFormElement,
  initial?: Resource): Resource | undefined {

  const result = (initial ? { ...initial } : {});

  for (let i = 0; i < form.elements.length; i++) {
    const element = form.elements[i] as HTMLElement;

    if (element instanceof HTMLInputElement) {
      if (element.disabled) {
        // Ignore disabled elements
        continue;
      }

      if ((element.type === 'checkbox' || element.type === 'radio') && !element.checked) {
        // Ignore unchecked radio or checkbox elements
        continue;
      }

      setValue(typeSchema, result, element.name, element.value);

    } else if (element instanceof HTMLSelectElement) {
      if (element.selectedOptions.length === 0) {
        // Ignore select elements with no value
        continue;
      }
      setValue(typeSchema, result, element.name, element.value);
    }
  }

  return result as Resource;
}

function setValue(typeDef: TypeSchema, result: any, fullName: string, value: string) {
  if (!fullName) {
    return;
  }

  const nameParts = fullName.split('.');
  const name = nameParts[0];

  const fieldDef = typeDef.properties[name];
  if (!fieldDef) {
    return;
  }

  const valueObj = isStringProperty(fieldDef) ? value : parseJson(value);

  if (fieldDef.array) {
    let array = result[name];
    if (!array) {
      array = result[name] = [];
    }
    const element = getEntryByKey(array, nameParts[1]);
    if (valueObj.__removed) {
      (array as any[]).splice(array.indexOf(element), 1);
    } else {
      Object.assign(element, valueObj);
    }
  } else {
    result[name] = valueObj;
  }
}

function getEntryByKey(array: any[], key: string) {
  const existing = array.find(e => e.__key === key);
  if (existing) {
    return existing;
  }
  const created = { __key: key };
  array.push(created);
  return created;
}

function parseJson(str: string): any {
  if (!str) {
    return undefined;
  }
  try {
    return JSON.parse(str, keyReplacer);
  } catch (err) {
    return str;
  }
}

function isStringProperty(fieldDef: PropertySchema) {
  switch (fieldDef.type) {
    case 'string':
    case 'canonical':
    case 'date':
    case 'dateTime':
    case 'enum':
    case 'instant':
    case 'uri':
    case 'url':
    case 'http://hl7.org/fhirpath/System.String':
      return true;
    default:
      return false;
  }
}
