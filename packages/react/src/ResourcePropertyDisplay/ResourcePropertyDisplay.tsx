import {
  formatDateTime,
  formatPeriod,
  formatTiming,
  getElementDefinitionTypeName,
  getTypedPropertyValue,
  PropertyType,
  TypedValue,
} from '@medplum/core';
import { ElementDefinition } from '@medplum/fhirtypes';
import React from 'react';
import { AddressDisplay } from '../AddressDisplay/AddressDisplay';
import { AttachmentArrayDisplay } from '../AttachmentArrayDisplay/AttachmentArrayDisplay';
import { AttachmentDisplay } from '../AttachmentDisplay/AttachmentDisplay';
import { BackboneElementDisplay } from '../BackboneElementDisplay/BackboneElementDisplay';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { CodingDisplay } from '../CodingDisplay/CodingDisplay';
import { ContactDetailDisplay } from '../ContactDetailDisplay/ContactDetailDisplay';
import { ContactPointDisplay } from '../ContactPointDisplay/ContactPointDisplay';
import { HumanNameDisplay } from '../HumanNameDisplay/HumanNameDisplay';
import { IdentifierDisplay } from '../IdentifierDisplay/IdentifierDisplay';
import { MoneyDisplay } from '../MoneyDisplay/MoneyDisplay';
import { QuantityDisplay } from '../QuantityDisplay/QuantityDisplay';
import { RangeDisplay } from '../RangeDisplay/RangeDisplay';
import { RatioDisplay } from '../RatioDisplay/RatioDisplay';
import { ReferenceDisplay } from '../ReferenceDisplay/ReferenceDisplay';
import { ResourceArrayDisplay } from '../ResourceArrayDisplay/ResourceArrayDisplay';
import { ActionIcon, Box, CopyButton, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';

export interface ResourcePropertyDisplayProps {
  property?: ElementDefinition;
  propertyType: PropertyType;
  value: any;
  arrayElement?: boolean;
  maxWidth?: number;
  ignoreMissingValues?: boolean;
  link?: boolean;
}

/**
 * Low-level component that renders a property from a given resource, given type information.
 * @param props The ResourcePropertyDisplay React props.
 * @returns The ResourcePropertyDisplay React node.
 */
export function ResourcePropertyDisplay(props: ResourcePropertyDisplayProps): JSX.Element {
  const { property, propertyType, value } = props;

  const isIdProperty = property?.path?.endsWith('.id');
  if (isIdProperty) {
    return (
      <Box component="div" sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {value}
        <CopyButton value={value} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="right">
              <ActionIcon color={copied ? 'teal' : 'gray'} onClick={copy}>
                {copied ? <IconCheck size="1rem" /> : <IconCopy size="1rem" />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Box>
    );
  }

  if (property?.max === '*' && !props.arrayElement) {
    if (propertyType === PropertyType.Attachment) {
      return <AttachmentArrayDisplay values={value} maxWidth={props.maxWidth} />;
    }
    return (
      <ResourceArrayDisplay
        property={property}
        values={value}
        ignoreMissingValues={props.ignoreMissingValues}
        link={props.link}
      />
    );
  }

  switch (propertyType) {
    case PropertyType.boolean:
      return <>{value === undefined ? '' : Boolean(value).toString()}</>;
    case PropertyType.SystemString:
    case PropertyType.string:
      return <div style={{ whiteSpace: 'pre-wrap' }}>{value}</div>;
    case PropertyType.code:
    case PropertyType.date:
    case PropertyType.integer:
    case PropertyType.positiveInt:
    case PropertyType.unsignedInt:
    case PropertyType.uri:
    case PropertyType.url:
      return <>{value}</>;
    case PropertyType.canonical:
      return <ReferenceDisplay value={{ reference: value }} link={props.link} />;
    case PropertyType.dateTime:
    case PropertyType.instant:
      return <>{formatDateTime(value)}</>;
    case PropertyType.markdown:
      return <pre>{value}</pre>;
    case PropertyType.Address:
      return <AddressDisplay value={value} />;
    case PropertyType.Annotation:
      return <>{value?.text}</>;
    case PropertyType.Attachment:
      return <AttachmentDisplay value={value} maxWidth={props.maxWidth} />;
    case PropertyType.CodeableConcept:
      return <CodeableConceptDisplay value={value} />;
    case PropertyType.Coding:
      return <CodingDisplay value={value} />;
    case PropertyType.ContactDetail:
      return <ContactDetailDisplay value={value} />;
    case PropertyType.ContactPoint:
      return <ContactPointDisplay value={value} />;
    case PropertyType.HumanName:
      return <HumanNameDisplay value={value} />;
    case PropertyType.Identifier:
      return <IdentifierDisplay value={value} />;
    case PropertyType.Money:
      return <MoneyDisplay value={value} />;
    case PropertyType.Period:
      return <>{formatPeriod(value)}</>;
    case PropertyType.Quantity:
    case PropertyType.Duration:
      return <QuantityDisplay value={value} />;
    case PropertyType.Range:
      return <RangeDisplay value={value} />;
    case PropertyType.Ratio:
      return <RatioDisplay value={value} />;
    case PropertyType.Reference:
      return <ReferenceDisplay value={value} link={props.link} />;
    case PropertyType.Timing:
      return <>{formatTiming(value)}</>;
    case PropertyType.Dosage:
    case PropertyType.UsageContext:
      return (
        <BackboneElementDisplay
          value={{ type: propertyType, value }}
          compact={true}
          ignoreMissingValues={props.ignoreMissingValues}
        />
      );
    default:
      if (!property?.path) {
        throw Error(`Displaying property of type ${props.propertyType} requires element definition path`);
      }
      return (
        <BackboneElementDisplay
          value={{ type: getElementDefinitionTypeName(property), value }}
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
 * @param path The property path.
 * @returns The value of the property and the property type.
 */
export function getValueAndType(context: TypedValue, path: string): [any, PropertyType] {
  const typedResult = getTypedPropertyValue(context, path);
  if (!typedResult) {
    return [undefined, 'undefined' as PropertyType];
  }

  if (Array.isArray(typedResult)) {
    return [typedResult.map((e) => e.value), typedResult[0].type as PropertyType];
  }

  return [typedResult.value, typedResult.type as PropertyType];
}
