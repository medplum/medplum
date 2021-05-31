import { PropertySchema } from '@medplum/core';
import React from 'react';
import { AddressDisplay } from './AddressDisplay';
import { AttachmentArrayDisplay } from './AttachmentArrayDisplay';
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
  property: PropertySchema;
  value: any;
  arrayElement?: boolean;
}

export function ResourcePropertyDisplay(props: ResourcePropertyDisplayProps) {
  const property = props.property;
  const value = props.value;

  if (property.array && !props.arrayElement) {
    if (property.type === 'Attachment') {
      return <AttachmentArrayDisplay values={value} />
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
      return value;
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
      return <BackboneElementDisplay property={property} value={value} />;
  }
}
