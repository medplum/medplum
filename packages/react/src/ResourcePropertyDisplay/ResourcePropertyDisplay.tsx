import { ActionIcon, Box, CopyButton, Tooltip } from '@mantine/core';
import {
  InternalSchemaElement,
  PropertyType,
  formatDateTime,
  formatPeriod,
  formatTiming,
  isEmpty,
} from '@medplum/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
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

export interface ResourcePropertyDisplayProps {
  property?: InternalSchemaElement;
  propertyType: string;
  value: any;
  arrayElement?: boolean;
  maxWidth?: number;
  ignoreMissingValues?: boolean;
  link?: boolean;
}

/**
 * Low-level component that renders a property from a given resource, given type information.
 * @param props - The ResourcePropertyDisplay React props.
 * @returns The ResourcePropertyDisplay React node.
 */
export function ResourcePropertyDisplay(props: ResourcePropertyDisplayProps): JSX.Element {
  const { property, propertyType, value } = props;

  const isIdProperty = property?.path?.endsWith('.id');
  if (isIdProperty) {
    return (
      <Box component="div" style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {value}
        {!isEmpty(value) && (
          <CopyButton value={value} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="right">
                <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                  {copied ? <IconCheck size="1rem" /> : <IconCopy size="1rem" />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        )}
      </Box>
    );
  }

  if (property?.max && property.max > 1 && !props.arrayElement) {
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
    case PropertyType.decimal:
    case PropertyType.id:
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
      if (!property) {
        throw Error(`Displaying property of type ${props.propertyType} requires element schema`);
      }
      return (
        <BackboneElementDisplay
          value={{ type: property.type[0].code, value }}
          compact={true}
          ignoreMissingValues={props.ignoreMissingValues}
        />
      );
  }
}
