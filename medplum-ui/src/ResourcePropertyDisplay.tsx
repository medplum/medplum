import { PropertyDefinition, schema } from 'medplum';
import React from 'react';
import { AddressDisplay } from './AddressDisplay';
import { AddressInput } from './AddressInput';
import { AttachmentArray } from './AttachmentArray';
import { AttachmentInput } from './AttachmentInput';
import { BackboneElementInput } from './BackboneElementInput';
import { CodeableConceptInput } from './CodeableConceptInput';
import { ContactPointDisplay } from './ContactPointDisplay';
import { ContactPointInput } from './ContactPointInput';
import { DeviceNameInput } from './DeviceNameInput';
import { HumanNameDisplay } from './HumanNameDisplay';
import { HumanNameInput } from './HumanNameInput';
import { IdentifierDisplay } from './IdentifierDisplay';
import { IdentifierInput } from './IdentifierInput';
import { PatientLinkInput } from './PatientLinkInput';
import { ReferenceInput } from './ReferenceInput';
import { ResourceArray } from './ResourceArray';
import { ResourceArrayDisplay } from './ResourceArrayDisplay';

export interface ResourcePropertyDisplayProps {
  propertyPrefix: string;
  property: PropertyDefinition;
  value: any;
  arrayElement?: boolean;
}

export function ResourcePropertyDisplay(props: ResourcePropertyDisplayProps) {
  const propertyPrefix = props.propertyPrefix;
  const property = props.property;
  const value = props.value;

  if (property.array && !props.arrayElement) {
    if (property.type === 'Attachment') {
      // return <AttachmentArr
      return <AttachmentArray propertyPrefix={propertyPrefix} property={property} values={value} />
    }
    return <ResourceArrayDisplay propertyPrefix={propertyPrefix} property={property} values={value} />
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
      return value;
    case 'number':
    case 'integer':
    case 'positiveInt':
    case 'unsignedInt':
      return value;
    case 'enum':
      return value;
    case 'boolean':
      return value === undefined ? '' : value;
    case 'markdown':
      return <pre>{value}</pre>
    case 'Address':
      return <AddressDisplay value={value} />;
    case 'Attachment':
      return <AttachmentInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'CodeableConcept':
      return <CodeableConceptInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'ContactPoint':
      return <ContactPointDisplay value={value} />;
    case 'Device_DeviceName':
      return <DeviceNameInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'HumanName':
      return <HumanNameDisplay value={value} />;
    case 'Identifier':
      return <IdentifierDisplay propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'Patient_Link':
      return <PatientLinkInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    case 'Reference':
      return <ReferenceInput propertyPrefix={propertyPrefix} property={property} value={value} />;
    default:
      {
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
}
