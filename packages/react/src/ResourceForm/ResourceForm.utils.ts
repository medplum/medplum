import { capitalize, InternalSchemaElement, isEmpty } from '@medplum/core';
import { StructureDefinition } from '@medplum/fhirtypes';
import React from 'react';

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

export type ResourceFormContextType = {
  includeExtensions: boolean;
};

export const ResourceFormContext = React.createContext<ResourceFormContextType>({
  includeExtensions: true,
});

export type ProfileStructureDefinition = StructureDefinition & {
  url: NonNullable<StructureDefinition['url']>;
  name: NonNullable<StructureDefinition['name']>;
};

export function isProfileStructureDefinition(profile?: StructureDefinition): profile is ProfileStructureDefinition {
  return !!profile && !isEmpty(profile.url) && !isEmpty(profile.name);
}
