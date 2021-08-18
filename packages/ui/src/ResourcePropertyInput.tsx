import { ElementDefinition, IndexedStructureDefinition } from '@medplum/core';
import React from 'react';
import { AddressInput } from './AddressInput';
import { AttachmentArrayInput } from './AttachmentArrayInput';
import { AttachmentInput } from './AttachmentInput';
import { BackboneElementInput } from './BackboneElementInput';
import { CodeableConceptInput } from './CodeableConceptInput';
import { CodeInput } from './CodeInput';
import { CodingInput } from './CodingInput';
import { ContactPointInput } from './ContactPointInput';
import { HumanNameInput } from './HumanNameInput';
import { IdentifierInput } from './IdentifierInput';
import { ReferenceInput } from './ReferenceInput';
import { ResourceArrayInput } from './ResourceArrayInput';

export interface ResourcePropertyInputProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  name: string;
  value: any;
  arrayElement?: boolean;
}

/**
 * List of property types.
 * http://www.hl7.org/fhir/valueset-defined-types.html
 * The list here includes additions found from StructureDefinition resources.
 */
enum PropertyType {
  Address = 'Address',
  Age = 'Age',
  Annotation = 'Annotation',
  Attachment = 'Attachment',
  BackboneElement = 'BackboneElement',
  CodeableConcept = 'CodeableConcept',
  Coding = 'Coding',
  ContactDetail = 'ContactDetail',
  ContactPoint = 'ContactPoint',
  Contributor = 'Contributor',
  Count = 'Count',
  DataRequirement = 'DataRequirement',
  Distance = 'Distance',
  Dosage = 'Dosage',
  Duration = 'Duration',
  ElementDefinition = 'ElementDefinition',
  Expression = 'Expression',
  Extension = 'Extension',
  HumanName = 'HumanName',
  Identifier = 'Identifier',
  MarketingStatus = 'MarketingStatus',
  Meta = 'Meta',
  Money = 'Money',
  Narrative = 'Narrative',
  ParameterDefinition = 'ParameterDefinition',
  Period = 'Period',
  Population = 'Population',
  ProdCharacteristic = 'ProdCharacteristic',
  ProductShelfLife = 'ProductShelfLife',
  Quantity = 'Quantity',
  Range = 'Range',
  Ratio = 'Ratio',
  Reference = 'Reference',
  RelatedArtifact = 'RelatedArtifact',
  Resource = 'Resource',
  SampledData = 'SampledData',
  Signature = 'Signature',
  SubstanceAmount = 'SubstanceAmount',
  SystemString = 'http://hl7.org/fhirpath/System.String',
  Timing = 'Timing',
  TriggerDefinition = 'TriggerDefinition',
  UsageContext = 'UsageContext',
  base64Binary = 'base64Binary',
  boolean = 'boolean',
  canonical = 'canonical',
  code = 'code',
  date = 'date',
  dateTime = 'dateTime',
  decimal = 'decimal',
  id = 'id',
  instant = 'instant',
  integer = 'integer',
  markdown = 'markdown',
  oid = 'oid',
  positiveInt = 'positiveInt',
  string = 'string',
  time = 'time',
  unsignedInt = 'unsignedInt',
  uri = 'uri',
  url = 'url',
  uuid = 'uuid',
}

export function ResourcePropertyInput(props: ResourcePropertyInputProps) {
  const property = props.property;
  const propertyType = property.type?.[0]?.code as PropertyType;
  const name = props.name;
  const value = props.value;

  if (property.max === '*' && !props.arrayElement) {
    if (propertyType === 'Attachment') {
      return <AttachmentArrayInput name={name} values={value} />
    }
    return <ResourceArrayInput schema={props.schema} property={property} name={name} values={value} />
  }

  switch (propertyType) {
    case PropertyType.SystemString:
    case PropertyType.canonical:
    case PropertyType.date:
    case PropertyType.dateTime:
    case PropertyType.instant:
    case PropertyType.string:
    case PropertyType.uri:
    case PropertyType.url:
      return (
        <input type="text" name={name} defaultValue={value}></input>
      );
    case PropertyType.integer:
    case PropertyType.positiveInt:
    case PropertyType.unsignedInt:
      return (
        <input type="text" name={name} defaultValue={value}></input>
      );
    case PropertyType.code:
      return (
        <CodeInput
          name={name}
          defaultValue={value}
          property={property}
        />);
    case PropertyType.boolean:
      return (
        <input type="checkbox" name={name} defaultChecked={!!value} value="true" />
      );
    case PropertyType.markdown:
      return (
        <textarea name={name} defaultValue={value} />
      );
    case PropertyType.Address:
      return <AddressInput name={name} value={value} />;
    case PropertyType.Attachment:
      return <AttachmentInput name={name} value={value} />;
    case PropertyType.Coding:
      return <CodingInput name={name} value={value} />;
    case PropertyType.CodeableConcept:
      return <CodeableConceptInput name={name} value={value} />;
    case PropertyType.ContactPoint:
      return <ContactPointInput name={name} value={value} />;
    case PropertyType.HumanName:
      return <HumanNameInput name={name} value={value} />;
    case PropertyType.Identifier:
      return <IdentifierInput name={name} value={value} />;
    case PropertyType.Reference:
      return <ReferenceInput property={property} name={name} value={value} />;
    default:
      return <BackboneElementInput schema={props.schema} property={property} name={name} value={value} />;
  }
}
