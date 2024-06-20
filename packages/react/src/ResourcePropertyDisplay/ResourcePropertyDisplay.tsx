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
import { ExtensionDisplay } from '../ExtensionDisplay/ExtensionDisplay';
import { ElementDefinitionType } from '@medplum/fhirtypes';

export interface ResourcePropertyDisplayProps {
  readonly property?: InternalSchemaElement;
  /** The path identifies the element and is expressed as a "."-separated list of ancestor elements, beginning with the name of the resource or extension. */
  readonly path?: string;
  readonly propertyType: string;
  readonly value: any;
  readonly arrayElement?: boolean;
  readonly maxWidth?: number;
  readonly ignoreMissingValues?: boolean;
  readonly link?: boolean;
  /** (Optional) The `ElemendDefinitionType` to display the property against. Used when displaying extensions.  */
  readonly elementDefinitionType?: ElementDefinitionType;
  /** (Optional) If true and `property` is an array, output is wrapped with a DescriptionListEntry */
  readonly includeArrayDescriptionListEntry?: boolean;
}

/**
 * Low-level component that renders a property from a given resource, given type information.
 * @param props - The ResourcePropertyDisplay React props.
 * @returns The ResourcePropertyDisplay React node.
 */
export function ResourcePropertyDisplay(props: ResourcePropertyDisplayProps): JSX.Element | null {
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

  if (property && (property.isArray || property.max > 1) && !props.arrayElement) {
    if (propertyType === PropertyType.Attachment) {
      return (
        <AttachmentArrayDisplay
          values={value}
          maxWidth={props.maxWidth}
          includeDescriptionListEntry={props.includeArrayDescriptionListEntry}
          property={property}
          path={props.path}
        />
      );
    }
    return (
      <ResourceArrayDisplay
        path={props.path}
        property={property}
        propertyType={propertyType}
        values={value}
        includeDescriptionListEntry={props.includeArrayDescriptionListEntry}
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
      if (!props.path) {
        throw Error(`Displaying property of type ${props.propertyType} requires path`);
      }
      return (
        <BackboneElementDisplay
          path={props.path}
          value={{ type: propertyType, value }}
          compact={true}
          ignoreMissingValues={props.ignoreMissingValues}
        />
      );
    case PropertyType.Extension:
      if (!props.path) {
        throw Error(`Displaying property of type ${props.propertyType} requires path`);
      }
      return (
        <ExtensionDisplay
          path={props.path}
          value={value}
          compact={true}
          ignoreMissingValues={props.ignoreMissingValues}
          elementDefinitionType={props.elementDefinitionType}
        />
      );
    default:
      if (!property) {
        throw Error(`Displaying property of type ${props.propertyType} requires element schema`);
      }
      if (!props.path) {
        throw Error(`Displaying property of type ${props.propertyType} requires path`);
      }
      return (
        <BackboneElementDisplay
          path={props.path}
          value={{ type: property.type[0].code, value }}
          compact={true}
          ignoreMissingValues={props.ignoreMissingValues}
        />
      );
  }
}
