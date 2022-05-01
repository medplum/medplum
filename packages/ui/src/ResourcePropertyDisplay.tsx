import { buildTypeName, capitalize, IndexedStructureDefinition, PropertyType } from '@medplum/core';
import { ElementDefinition } from '@medplum/fhirtypes';
import React from 'react';
import { AddressDisplay } from './AddressDisplay';
import { AttachmentArrayDisplay } from './AttachmentArrayDisplay';
import { AttachmentDisplay } from './AttachmentDisplay';
import { BackboneElementDisplay } from './BackboneElementDisplay';
import { CodeableConceptDisplay } from './CodeableConceptDisplay';
import { CodingDisplay } from './CodingDisplay';
import { ContactPointDisplay } from './ContactPointDisplay';
import { DateTimeDisplay } from './DateTimeDisplay';
import { HumanNameDisplay } from './HumanNameDisplay';
import { IdentifierDisplay } from './IdentifierDisplay';
import { PeriodDisplay } from './PeriodDisplay';
import { QuantityDisplay } from './QuantityDisplay';
import { RangeDisplay } from './RangeDisplay';
import { RatioDisplay } from './RatioDisplay';
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
  link?: boolean;
}

export function ResourcePropertyDisplay(props: ResourcePropertyDisplayProps): JSX.Element {
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
        link={props.link}
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
    case PropertyType.integer:
    case PropertyType.positiveInt:
    case PropertyType.string:
    case PropertyType.unsignedInt:
    case PropertyType.uri:
    case PropertyType.url:
      return <div>{value}</div>;
    case PropertyType.dateTime:
    case PropertyType.instant:
      return <DateTimeDisplay value={value} />;
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
    case PropertyType.Coding:
      return <CodingDisplay value={value} />;
    case PropertyType.ContactPoint:
      return <ContactPointDisplay value={value} />;
    case PropertyType.HumanName:
      return <HumanNameDisplay value={value} />;
    case PropertyType.Identifier:
      return <IdentifierDisplay value={value} />;
    case PropertyType.Period:
      return <PeriodDisplay value={value} />;
    case PropertyType.Quantity:
      return <QuantityDisplay value={value} />;
    case PropertyType.Range:
      return <RangeDisplay value={value} />;
    case PropertyType.Ratio:
      return <RatioDisplay value={value} />;
    case PropertyType.Reference:
      return <ReferenceDisplay value={value} link={props.link} />;
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

/**
 * Returns the value of the property and the property type.
 * Some property definitions support multiple types.
 * For example, "Observation.value[x]" can be "valueString", "valueInteger", "valueQuantity", etc.
 * According to the spec, there can only be one property for a given element definition.
 * This function returns the value and the type.
 * @param context The base context (usually a FHIR resource).
 * @param property The property definition.
 * @returns The value of the property and the property type.
 */
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

  return [undefined, types[0].code as PropertyType];
}
