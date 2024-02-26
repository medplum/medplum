import { capitalize, InternalSchemaElement, isEmpty } from '@medplum/core';
import { StructureDefinition } from '@medplum/fhirtypes';

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

export type SupportedProfileStructureDefinition = StructureDefinition & {
  url: NonNullable<StructureDefinition['url']>;
  name: NonNullable<StructureDefinition['name']>;
};

export function isSupportedProfileStructureDefinition(
  profile?: StructureDefinition
): profile is SupportedProfileStructureDefinition {
  return !!profile && !isEmpty(profile.url) && !isEmpty(profile.name);
}
