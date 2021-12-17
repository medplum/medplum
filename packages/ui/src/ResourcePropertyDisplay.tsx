import { IndexedStructureDefinition, PropertyType } from '@medplum/core';
import { ElementDefinition } from '@medplum/fhirtypes';
import React from 'react';
import { AddressDisplay } from './AddressDisplay';
import { AttachmentArrayDisplay } from './AttachmentArrayDisplay';
import { AttachmentDisplay } from './AttachmentDisplay';
import { BackboneElementDisplay } from './BackboneElementDisplay';
import { CodeableConceptDisplay } from './CodeableConceptDisplay';
import { ContactPointDisplay } from './ContactPointDisplay';
import { HumanNameDisplay } from './HumanNameDisplay';
import { IdentifierDisplay } from './IdentifierDisplay';
import { QuantityDisplay } from './QuantityDisplay';
import { ReferenceDisplay } from './ReferenceDisplay';
import { ResourceArrayDisplay } from './ResourceArrayDisplay';

export interface ResourcePropertyDisplayProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  value: any;
  arrayElement?: boolean;
  maxWidth?: number;
}

export function ResourcePropertyDisplay(props: ResourcePropertyDisplayProps) {
  const property = props.property;
  const propertyType = property.type?.[0]?.code as PropertyType;
  const value = props.value;

  if (property.max === '*' && !props.arrayElement) {
    if (propertyType === 'Attachment') {
      return <AttachmentArrayDisplay values={value} maxWidth={props.maxWidth} />;
    }
    return <ResourceArrayDisplay schema={props.schema} property={property} values={value} />;
  }
  switch (propertyType) {
    case PropertyType.boolean:
      return <div>{value === undefined ? '' : Boolean(value).toString()}</div>;
    case PropertyType.SystemString:
    case PropertyType.canonical:
    case PropertyType.code:
    case PropertyType.date:
    case PropertyType.dateTime:
    case PropertyType.instant:
    case PropertyType.integer:
    case PropertyType.positiveInt:
    case PropertyType.string:
    case PropertyType.unsignedInt:
    case PropertyType.uri:
    case PropertyType.url:
      return <div>{value}</div>;
    case PropertyType.markdown:
      return <pre>{value}</pre>;
    case PropertyType.Address:
      return <AddressDisplay value={value} />;
    case PropertyType.Annotation:
      return <div>{value?.text}</div>;
    case PropertyType.Attachment:
      return <AttachmentDisplay value={value} maxWidth={props.maxWidth} />;
    case PropertyType.CodeableConcept:
      return <CodeableConceptDisplay value={value} />;
    case PropertyType.ContactPoint:
      return <ContactPointDisplay value={value} />;
    case PropertyType.HumanName:
      return <HumanNameDisplay value={value} />;
    case PropertyType.Identifier:
      return <IdentifierDisplay value={value} />;
    case PropertyType.Quantity:
      return <QuantityDisplay value={value} />;
    case PropertyType.Reference:
      return <ReferenceDisplay value={value} />;
    default:
      return <BackboneElementDisplay schema={props.schema} property={property} value={value} />;
  }
}
