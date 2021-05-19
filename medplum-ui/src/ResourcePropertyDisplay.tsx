import { PropertyDefinition, schema } from 'medplum';
import React from 'react';
import { AddressDisplay } from './AddressDisplay';
import { AttachmentArray } from './AttachmentArray';
import { AttachmentDisplay } from './AttachmentDisplay';
import { BackboneElementDisplay } from './BackboneElementDisplay';
import { CodeableConceptDisplay } from './CodeableConceptDisplay';
import { ContactPointDisplay } from './ContactPointDisplay';
import { DeviceNameDisplay } from './DeviceNameDisplay';
import { HumanNameDisplay } from './HumanNameDisplay';
import { IdentifierDisplay } from './IdentifierDisplay';
import { PatientLinkDisplay } from './PatientLinkDisplay';
import { ReferenceDisplay } from './ReferenceDisplay';
import { ResourceArrayDisplay } from './ResourceArrayDisplay';

export interface ResourcePropertyDisplayProps {
  property: PropertyDefinition;
  value: any;
  arrayElement?: boolean;
}

export function ResourcePropertyDisplay(props: ResourcePropertyDisplayProps) {
  const property = props.property;
  const value = props.value;

  if (property.array && !props.arrayElement) {
    if (property.type === 'Attachment') {
      return <AttachmentArray property={property} name="" values={value} />
    }
    return <ResourceArrayDisplay property={property} values={value} />
  }

  if (!value) {
    return null;
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
      return <AttachmentDisplay value={value} />;
    case 'CodeableConcept':
      return <CodeableConceptDisplay value={value} />;
    case 'ContactPoint':
      return <ContactPointDisplay value={value} />;
    case 'Device_DeviceName':
      return <DeviceNameDisplay value={value} />;
    case 'HumanName':
      return <HumanNameDisplay value={value} />;
    case 'Identifier':
      return <IdentifierDisplay value={value} />;
    case 'Patient_Link':
      return <PatientLinkDisplay value={value} />;
    case 'Reference':
      return <ReferenceDisplay value={value} />;
    default:
      {
        const backboneType = schema[property.type];
        if (backboneType) {
          return (
            <BackboneElementDisplay backboneType={backboneType} value={value} />
          );
        } else {
          return (
            <input type="text" defaultValue={value}></input>
          );
        }
      }
  }
}
