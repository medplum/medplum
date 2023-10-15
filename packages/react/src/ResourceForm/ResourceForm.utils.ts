import { capitalize, InternalSchemaElement } from '@medplum/core';

export function setPropertyValue(
  obj: any,
  key: string,
  propName: string,
  elementDefinition: InternalSchemaElement,
  value: any
): any {
  const types = elementDefinition.type;
  if (types.length > 1) {
    for (const type of types) {
      const compoundKey = key.replace('[x]', capitalize(type.code as string));
      if (compoundKey in obj) {
        delete obj[compoundKey];
      }
    }
  }
  obj[propName] = value;
  return obj;
}
