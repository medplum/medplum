import { ElementDefinition, IndexedStructureDefinition, PropertyType } from '@medplum/core';
import React from 'react';
import { AddressInput } from './AddressInput';
import { AttachmentArrayInput } from './AttachmentArrayInput';
import { AttachmentInput } from './AttachmentInput';
import { BackboneElementInput } from './BackboneElementInput';
import { CodeableConceptInput } from './CodeableConceptInput';
import { CodeInput } from './CodeInput';
import { CodingInput } from './CodingInput';
import { ContactPointInput } from './ContactPointInput';
import { ExtensionInput } from './ExtensionInput';
import { HumanNameInput } from './HumanNameInput';
import { IdentifierInput } from './IdentifierInput';
import { ReferenceInput } from './ReferenceInput';
import { ResourceArrayInput } from './ResourceArrayInput';

export interface ResourcePropertyInputProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  name: string;
  defaultValue?: any;
  arrayElement?: boolean;
}

export function ResourcePropertyInput(props: ResourcePropertyInputProps) {
  const property = props.property;
  const propertyType = property.type?.[0]?.code as PropertyType;
  const name = props.name;
  const value = props.defaultValue;

  if (property.max === '*' && !props.arrayElement) {
    if (propertyType === 'Attachment') {
      return <AttachmentArrayInput name={name} defaultValue={value} />
    }
    return <ResourceArrayInput schema={props.schema} property={property} name={name} defaultValue={value} />
  }

  switch (propertyType) {
    case PropertyType.SystemString:
    case PropertyType.canonical:
    case PropertyType.date:
    case PropertyType.dateTime:
    case PropertyType.instant:
    case PropertyType.string:
    case PropertyType.uri:
    case PropertyType.url:
      return (
        <input type="text" name={name} defaultValue={value}></input>
      );
    case PropertyType.integer:
    case PropertyType.positiveInt:
    case PropertyType.unsignedInt:
      return (
        <input type="number" name={name} defaultValue={value}></input>
      );
    case PropertyType.code:
      return <CodeInput property={property} name={name} defaultValue={value} />;
    case PropertyType.boolean:
      return (
        <input type="checkbox" name={name} defaultChecked={!!value} value="true" />
      );
    case PropertyType.markdown:
      return (
        <textarea name={name} defaultValue={value} />
      );
    case PropertyType.Address:
      return <AddressInput name={name} defaultValue={value} />;
    case PropertyType.Attachment:
      return <AttachmentInput name={name} defaultValue={value} />;
    case PropertyType.CodeableConcept:
      return <CodeableConceptInput property={property} name={name} defaultValue={value} />;
    case PropertyType.Coding:
      return <CodingInput property={property} name={name} defaultValue={value} />;
    case PropertyType.ContactPoint:
      return <ContactPointInput name={name} defaultValue={value} />;
    case PropertyType.HumanName:
      return <HumanNameInput name={name} defaultValue={value} />;
    case PropertyType.Identifier:
      return <IdentifierInput name={name} defaultValue={value} />;
    case PropertyType.Reference:
      return <ReferenceInput property={property} name={name} defaultValue={value} />;
    case PropertyType.Extension:
      return <ExtensionInput name={name} defaultValue={value} />;
    default:
      return <BackboneElementInput schema={props.schema} property={property} name={name} defaultValue={value} />;
  }
}
