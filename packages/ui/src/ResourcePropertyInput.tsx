import { ElementDefinition } from '@medplum/core';
import React from 'react';
import { AddressInput } from './AddressInput';
import { AttachmentArrayInput } from './AttachmentArrayInput';
import { AttachmentInput } from './AttachmentInput';
import { BackboneElementInput } from './BackboneElementInput';
import { CodeableConceptInput } from './CodeableConceptInput';
import { CodingInput } from './CodingInput';
import { ContactPointInput } from './ContactPointInput';
import { DeviceNameInput } from './DeviceNameInput';
import { EnumInput } from './EnumInput';
import { HumanNameInput } from './HumanNameInput';
import { IdentifierInput } from './IdentifierInput';
import { PatientLinkInput } from './PatientLinkInput';
import { ReferenceInput } from './ReferenceInput';
import { ResourceArrayInput } from './ResourceArrayInput';

export interface ResourcePropertyInputProps {
  property: ElementDefinition;
  name: string;
  value: any;
  arrayElement?: boolean;
}

export function ResourcePropertyInput(props: ResourcePropertyInputProps) {
  const property = props.property;
  const propertyType = property.type?.[0]?.code;
  const name = props.name;
  const value = props.value;

  if (property.max === '*' && !props.arrayElement) {
    if (propertyType === 'Attachment') {
      return <AttachmentArrayInput name={name} values={value} />
    }
    return <ResourceArrayInput property={property} name={name} values={value} />
  }

  switch (propertyType) {
    case 'string':
    case 'canonical':
    case 'date':
    case 'dateTime':
    case 'instant':
    case 'uri':
    case 'url':
    case 'http://hl7.org/fhirpath/System.String':
      return (
        <input type="text" name={name} defaultValue={value}></input>
      );
    case 'number':
    case 'integer':
    case 'positiveInt':
    case 'unsignedInt':
      return (
        <input type="text" name={name} defaultValue={value}></input>
      );
    case 'enum':
      return (
        <EnumInput
          name={name}
          value={value}
          property={property}
        />);
    case 'boolean':
      return (
        <input type="checkbox" name={name} defaultChecked={!!value} value="true" />
      );
    case 'markdown':
      return (
        <textarea name={name} defaultValue={value} />
      );
    case 'Address':
      return <AddressInput name={name} value={value} />;
    case 'Attachment':
      return <AttachmentInput name={name} value={value} />;
    case 'Coding':
      return <CodingInput name={name} value={value} />;
    case 'CodeableConcept':
      return <CodeableConceptInput name={name} value={value} />;
    case 'ContactPoint':
      return <ContactPointInput name={name} value={value} />;
    case 'Device_DeviceName':
      return <DeviceNameInput name={name} value={value} />;
    case 'HumanName':
      return <HumanNameInput name={name} value={value} />;
    case 'Identifier':
      return <IdentifierInput name={name} value={value} />;
    case 'Patient_Link':
      return <PatientLinkInput name={name} value={value} />;
    case 'Reference':
      return <ReferenceInput property={property} name={name} value={value} />;
    default:
      return <BackboneElementInput property={property} name={name} value={value} />;
  }
}
