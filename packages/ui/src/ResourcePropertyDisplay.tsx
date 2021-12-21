import { buildTypeName, capitalize, IndexedStructureDefinition, PropertyType } from '@medplum/core';
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
  propertyType: PropertyType;
  value: any;
  arrayElement?: boolean;
  maxWidth?: number;
  ignoreMissingValues?: boolean;
}

export function ResourcePropertyDisplay(props: ResourcePropertyDisplayProps) {
  const { property, propertyType, value } = props;

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
          typeName={buildTypeName(property.path?.split('.') as string[])}
          value={value}
          compact={true}
          ignoreMissingValues={props.ignoreMissingValues}
        />
      );
  }
}

export function getValueAndType(context: any, property: ElementDefinition): [any, PropertyType] {
  if (!context) {
    return [undefined, PropertyType.string];
  }

  const path = property.path?.split('.')?.pop();
  if (!path) {
    return [undefined, PropertyType.string];
  }

  const types = property.type;
  if (!types || types.length === 0) {
    return [undefined, PropertyType.string];
  }

  if (types.length === 1) {
    return [context[path], types[0].code as PropertyType];
  }

  for (const type of types) {
    const path2 = path.replace('[x]', capitalize(type.code as string)) as string;
    if (path2 in context) {
      return [context[path2], type.code as PropertyType];
    }
  }

  return [undefined, PropertyType.string];
}
