import { IndexedStructureDefinition, PropertyType } from '@medplum/core';
import { ElementDefinition, ElementDefinitionType } from '@medplum/fhirtypes';
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
  ignoreMissingValues?: boolean;
}

export function ResourcePropertyDisplay(props: ResourcePropertyDisplayProps) {
  const value = props.value;
  if (!value) {
    return null;
  }

  const property = props.property;
  if (!property.type || property.type.length === 0) {
    return null;
  }

  const propertyType = guessPropertyType(value, property.type);
  if (property.max === '*' && !props.arrayElement) {
    if (propertyType === 'Attachment') {
      return <AttachmentArrayDisplay values={value} maxWidth={props.maxWidth} />;
    }
    return (
      <ResourceArrayDisplay
        schema={props.schema}
        property={property}
        values={value}
        ignoreMissingValues={props.ignoreMissingValues}
      />
    );
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
      return (
        <BackboneElementDisplay
          schema={props.schema}
          property={property}
          value={value}
          ignoreMissingValues={props.ignoreMissingValues}
        />
      );
  }
}

function guessPropertyType(value: any, types: ElementDefinitionType[]): PropertyType {
  if (types.length === 1) {
    // Common case - only one property type
    return types[0].code as PropertyType;
  }

  for (const type of types) {
    if (type.code === 'Reference' && value.reference) {
      return PropertyType.Reference;
    }
    if (type.code === 'CodeableConcept' && value.coding) {
      return PropertyType.CodeableConcept;
    }
    if (type.code === 'Quantity' && value.value) {
      return PropertyType.Quantity;
    }
    if (type.code === 'Attachment' && value.contentType) {
      return PropertyType.Attachment;
    }
    if (type.code === 'HumanName' && value.family) {
      return PropertyType.HumanName;
    }
    if (type.code === 'Identifier' && value.system) {
      return PropertyType.Identifier;
    }
    if (type.code === 'ContactPoint' && value.system) {
      return PropertyType.ContactPoint;
    }
    if (type.code === 'Address' && value.city) {
      return PropertyType.Address;
    }
    if (type.code === 'Attachment' && value.url) {
      return PropertyType.Attachment;
    }
  }

  // Default case - guess the first value
  return types[0].code as PropertyType;
}
