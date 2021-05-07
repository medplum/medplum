import { PropertyDefinition, schema } from 'medplum';
import React from 'react';
import { AddressInput } from './AddressInput';
import { AttachmentArray } from './AttachmentArray';
import { AttachmentInput } from './AttachmentInput';
import { BackboneElementInput } from './BackboneElementInput';
import { CodeableConceptInput } from './CodeableConceptInput';
import { ContactPointInput } from './ContactPointInput';
import { DeviceNameInput } from './DeviceNameInput';
import { EnumInput } from './EnumInput';
import { HumanNameInput } from './HumanNameInput';
import { IdentifierInput } from './IdentifierInput';
import { PatientLinkInput } from './PatientLinkInput';
import { ReferenceInput } from './ReferenceInput';
import { ResourceArray } from './ResourceArray';

export interface ResourceFieldProps {
  propertyPrefix: string;
  property: PropertyDefinition;
  value: any;
  arrayElement?: boolean;
}

export function ResourceField(props: ResourceFieldProps) {
  const propertyPrefix = props.propertyPrefix;
  const property = props.property;
  const value = props.value;

  if (property.array && !props.arrayElement) {
    if (property.type === 'Attachment') {
      // return <AttachmentArr
      return <AttachmentArray propertyPrefix={propertyPrefix} property={property} values={value} />
    }
    return <ResourceArray propertyPrefix={propertyPrefix} property={property} values={value} />
  }

  switch (property.type) {
    case 'string':
    case 'canonical':
    case 'date':
    case 'dateTime':
    case 'instant':
    case 'uri':
    case 'url':
    case 'http://hl7.org/fhirpath/System.String':
      return (
        <input type="text" defaultValue={value}></input>
      );
    case 'number':
    case 'integer':
    case 'positiveInt':
    case 'unsignedInt':
      return (
        <input type="text" defaultValue={value}></input>
      );
    case 'enum':
      return (
        <EnumInput
          propertyPrefix={propertyPrefix}
          property={property}
          label={property.display}
          options={property.enumValues}
          helperText={property.description}
          value={value}
        />);
    case 'boolean':
      return (
        <input type="checkbox" defaultChecked={!!value} />
      );
    case 'markdown':
      return (
        <textarea defaultValue={value} />
      );
    case 'Address':
      return <AddressInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'Attachment':
      return <AttachmentInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'CodeableConcept':
      return <CodeableConceptInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'ContactPoint':
      return <ContactPointInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'Device_DeviceName':
      return <DeviceNameInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'HumanName':
      return <HumanNameInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'Identifier':
      return <IdentifierInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'Patient_Link':
      return <PatientLinkInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'Reference':
      return <ReferenceInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    default:
      const backboneType = schema[property.type];
      if (backboneType) {
        return (
          <BackboneElementInput propertyPrefix={propertyPrefix} property={property} backboneType={backboneType} value={value} />
        );
      } else {
        return (
          <input type="text" defaultValue={value}></input>
        );
      }
  }
}
