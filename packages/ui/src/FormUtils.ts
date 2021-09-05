import { buildTypeName, ElementDefinition, IndexedStructureDefinition, Resource } from '@medplum/core';

let nextKeyId = 1;

/**
 * Generates a short unique key that can be used for local identifiers.
 * @return A unique key.
 */
export function generateKey(): string {
  return 'key' + (nextKeyId++);
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
  const result: Record<string, string> = {};

  for (const element of Array.from(form.elements)) {
    if (element instanceof HTMLInputElement) {
      parseInputElement(result, element);

    } else if (element instanceof HTMLTextAreaElement) {
      result[element.name] = element.value;

    } else if (element instanceof HTMLSelectElement) {
      parseSelectElement(result, element);
    }
  }

  return result;
}

/**
 * Parses an HTML input element.
 * Sets the name/value pair in the result,
 * but only if the element is enabled and checked.
 * @param el The input element.
 * @param result The result builder.
 */
function parseInputElement(result: Record<string, string>, el: HTMLInputElement): void {
  if (el.disabled) {
    // Ignore disabled elements
    return;
  }

  if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) {
    // Ignore unchecked radio or checkbox elements
    return;
  }

  result[el.name] = el.value;
}

/**
 * Parses an HTML select element.
 * Sets the name/value pair if one is selected.
 * @param result The result builder.
 * @param el The select element.
 */
function parseSelectElement(result: Record<string, string>, el: HTMLSelectElement): void {
  result[el.name] = el.value;
}

/**
 * Parses an HTML form and returns the result as a JavaScript object.
 * @param schema The schema / indexed structure definition.
 * @param resourceType The base resource type.
 * @param form The HTML form element.
 * @param initial
 * @returns
 */
export function parseResourceForm(
  schema: IndexedStructureDefinition,
  resourceType: string,
  form: HTMLFormElement,
  initial?: Resource): Resource {

  const result: Resource = (initial ? { ...initial } : {}) as Resource;

  for (const element of Array.from(form.elements)) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      parseResourceInputElement(schema, resourceType, result, element);
    }
  }

  return result;
}

/**
 * Parses an HTML input element.
 * Sets the name/value pair in the result,
 * but only if the element is enabled and checked.
 * @param schema The schema / indexed structure definition.
 * @param resourceType The base resource type.
 * @param result The result builder.
 * @param el The input element.
 */
function parseResourceInputElement(
  schema: IndexedStructureDefinition,
  resourceType: string,
  result: Resource,
  el: HTMLInputElement | HTMLTextAreaElement): void {

  if (el.disabled) {
    // Ignore disabled elements
    return;
  }

  if ((el.type === 'checkbox' || el.type === 'radio') && !(el as HTMLInputElement).checked) {
    // Ignore unchecked radio or checkbox elements
    return;
  }

  setValue(schema, resourceType, result, el.name, el.value);
}

/**
 *
 * @param schema The schema / indexed structure definition.
 * @param resourceType The base resource type.
 * @param result The result builder.
 * @param fullName The input name.
 * @param value The input value.
 */
function setValue(
  schema: IndexedStructureDefinition,
  resourceType: string,
  result: any,
  fullName: string,
  value: string): void {

  if (!fullName || !value) {
    return;
  }

  const nameParts = fullName.split('.');
  let typeName = resourceType;
  let base = result;
  let i = 0;

  while (i < nameParts.length) {
    const typeDef = schema.types[typeName];
    const propertyName = nameParts[i];
    const property = typeDef.properties[propertyName];
    if (!property) {
      return;
    }

    const valueObj = parseValue(property, value);
    if (property.max === '*') {
      // This is an array property.
      // Use the next name part to find the correct element in the array.
      const array = getArrayOrCreate(base, propertyName);
      const element = getEntryByKey(array, nameParts[++i]);
      if (i === nameParts.length - 1) {
        // This is the last name part, so set the value.
        if (valueObj?.__removed) {
          array.splice(array.indexOf(element), 1);
        } else {
          Object.assign(element, valueObj);
        }
      } else {
        // This is not the last name part, so use the array element as the next base.
        base = element;
      }

    } else {
      // This is not an array property.
      if (i === nameParts.length - 1) {
        // This is the last name part, so set the value.
        base[propertyName] = valueObj;
      } else {
        // This is not the last name part, so build the nested object.
        let obj = base[propertyName];
        if (!obj) {
          obj = base[propertyName] = {};
        }
        base = obj;
      }
    }

    typeName = buildTypeName([typeName, propertyName]);
    i++;
  }
}

function getArrayOrCreate(base: any, propertyName: string): any[] {
  let array = base[propertyName];
  if (!array) {
    array = base[propertyName] = [];
  }
  return array;
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

function parseValue(elementDefinition: ElementDefinition, str: string): any {
  return isStringProperty(elementDefinition) ? str : parseJson(str);
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

function isStringProperty(fieldDef: ElementDefinition) {
  const code = fieldDef.type?.[0]?.code;
  if (!code) {
    return false;
  }
  switch (code) {
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
