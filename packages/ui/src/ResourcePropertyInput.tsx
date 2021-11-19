import { ElementDefinition, IndexedStructureDefinition, OperationOutcome, PropertyType } from '@medplum/core';
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
import { TextField } from './TextField';

export interface ResourcePropertyInputProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  name: string;
  defaultValue?: any;
  arrayElement?: boolean;
  onChange?: (value: any) => void;
  outcome?: OperationOutcome;
}

export function ResourcePropertyInput(props: ResourcePropertyInputProps) {
  const property = props.property;
  const propertyType = property.type?.[0]?.code as PropertyType;
  const name = props.name;
  const value = props.defaultValue;

  if (property.max === '*' && !props.arrayElement) {
    if (propertyType === 'Attachment') {
      return (
        <AttachmentArrayInput
          name={name}
          defaultValue={value}
          onChange={props.onChange}
        />
      );
    }
    return (
      <ResourceArrayInput
        schema={props.schema}
        property={property}
        name={name}
        defaultValue={value}
        onChange={props.onChange}
      />
    );
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
        <TextField
          type="text"
          name={name}
          testid={name}
          defaultValue={value}
          onChange={(e: React.ChangeEvent) => props.onChange && props.onChange((e.target as HTMLInputElement).value)}
          outcome={props.outcome}
        />
      );
    case PropertyType.integer:
    case PropertyType.positiveInt:
    case PropertyType.unsignedInt:
      return (
        <TextField
          type="number"
          name={name}
          defaultValue={value}
          onChange={(e: React.ChangeEvent) => props.onChange && props.onChange((e.target as HTMLInputElement).value)}
          outcome={props.outcome}
        />
      );
    case PropertyType.code:
      return <CodeInput property={property} name={name} defaultValue={value} />;
    case PropertyType.boolean:
      return (
        <input
          type="checkbox"
          name={name}
          defaultChecked={!!value} value="true"
          onChange={(e: React.ChangeEvent) => props.onChange && props.onChange((e.target as HTMLInputElement).value)}
        />
      );
    case PropertyType.markdown:
      return (
        <textarea
          name={name}
          defaultValue={value}
          onChange={(e: React.ChangeEvent) => props.onChange && props.onChange((e.target as HTMLInputElement).value)}
        />
      );
    case PropertyType.Address:
      return (
        <AddressInput
          name={name}
          defaultValue={value}
          onChange={props.onChange}
        />
      );
    case PropertyType.Attachment:
      return (
        <AttachmentInput
          name={name}
          defaultValue={value}
        />
      );
    case PropertyType.CodeableConcept:
      return (
        <CodeableConceptInput
          property={property}
          name={name}
          defaultValue={value}
          onChange={props.onChange}
        />
      );
    case PropertyType.Coding:
      return (
        <CodingInput
          property={property}
          name={name}
          defaultValue={value}
          onChange={props.onChange}
        />
      );
    case PropertyType.ContactPoint:
      return (
        <ContactPointInput
          name={name}
          defaultValue={value}
          onChange={props.onChange}
        />
      );
    case PropertyType.HumanName:
      return (
        <HumanNameInput
          name={name}
          defaultValue={value}
          onChange={props.onChange}
        />
      );
    case PropertyType.Identifier:
      return (
        <IdentifierInput
          name={name}
          defaultValue={value}
          onChange={props.onChange}
        />
      );
    case PropertyType.Reference:
      return (
        <ReferenceInput
          property={property}
          name={name}
          defaultValue={value}
          onChange={props.onChange}
        />
      );
    case PropertyType.Extension:
      return (
        <ExtensionInput
          name={name}
          defaultValue={value}
          onChange={props.onChange}
        />
      );
    default:
      return (
        <BackboneElementInput
          schema={props.schema}
          property={property}
          name={name}
          defaultValue={value}
          onChange={props.onChange}
        />
      );
  }
}
