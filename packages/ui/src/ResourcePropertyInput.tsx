import { capitalize, IndexedStructureDefinition, PropertyType } from '@medplum/core';
import { ElementDefinition, ElementDefinitionType, OperationOutcome } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { AddressInput } from './AddressInput';
import { AnnotationInput } from './AnnotationInput';
import { AttachmentArrayInput } from './AttachmentArrayInput';
import { AttachmentInput } from './AttachmentInput';
import { BackboneElementInput } from './BackboneElementInput';
import { CodeableConceptInput } from './CodeableConceptInput';
import { CodeInput } from './CodeInput';
import { CodingInput } from './CodingInput';
import { ContactPointInput } from './ContactPointInput';
import { ExtensionInput } from './ExtensionInput';
import { HumanNameInput } from './HumanNameInput';
import { IdentifierInput } from './IdentifierInput';
import { InputRow } from './InputRow';
import { PeriodInput } from './PeriodInput';
import { QuantityInput } from './QuantityInput';
import { ReferenceInput } from './ReferenceInput';
import { ResourceArrayInput } from './ResourceArrayInput';
import { TextField } from './TextField';

export interface ResourcePropertyInputProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  name: string;
  defaultPropertyType?: PropertyType;
  defaultValue?: any;
  arrayElement?: boolean;
  onChange?: (value: any, propName?: string) => void;
  outcome?: OperationOutcome;
}

export function ResourcePropertyInput(props: ResourcePropertyInputProps): JSX.Element {
  const property = props.property;
  const propertyType = props.defaultPropertyType ?? (property.type?.[0]?.code as PropertyType);
  const name = props.name;
  const value = props.defaultValue;

  if (property.max === '*' && !props.arrayElement) {
    if (propertyType === 'Attachment') {
      return <AttachmentArrayInput name={name} defaultValue={value} onChange={props.onChange} />;
    }
    return (
      <ResourceArrayInput
        schema={props.schema}
        property={property}
        name={name}
        defaultValue={value}
        onChange={props.onChange}
      />
    );
  }

  const propertyTypes = property.type as ElementDefinitionType[];
  if (propertyTypes.length > 1) {
    return <ElementDefinitionInputSelector elementDefinitionTypes={propertyTypes} {...props} />;
  } else {
    return <ElementDefinitionTypeInput elementDefinitionType={propertyTypes[0]} {...props} />;
  }
}

export interface ElementDefinitionSelectorProps extends ResourcePropertyInputProps {
  elementDefinitionTypes: ElementDefinitionType[];
}

export function ElementDefinitionInputSelector(props: ElementDefinitionSelectorProps): JSX.Element {
  const propertyTypes = props.elementDefinitionTypes;
  let initialPropertyType: ElementDefinitionType;
  if (props.defaultPropertyType) {
    initialPropertyType = propertyTypes.find((t) => t.code === props.defaultPropertyType) as ElementDefinitionType;
  } else {
    initialPropertyType = propertyTypes[0];
  }
  const [selectedType, setSelectedType] = useState(initialPropertyType);
  return (
    <InputRow>
      <select
        style={{ width: '200px' }}
        defaultValue={selectedType.code}
        onChange={(e: React.ChangeEvent) => {
          setSelectedType(
            propertyTypes.find(
              (type: ElementDefinitionType) => type.code === (e.target as HTMLSelectElement).value
            ) as ElementDefinitionType
          );
        }}
      >
        {propertyTypes.map((type: ElementDefinitionType) => (
          <option key={type.code} value={type.code}>
            {type.code}
          </option>
        ))}
      </select>
      <ElementDefinitionTypeInput
        {...props}
        elementDefinitionType={selectedType}
        onChange={(newValue: any) => {
          if (props.onChange) {
            props.onChange(newValue, props.name.replace('[x]', capitalize(selectedType.code as string)));
          }
        }}
      />
    </InputRow>
  );
}

export interface ElementDefinitionTypeInputProps extends ResourcePropertyInputProps {
  elementDefinitionType: ElementDefinitionType;
}

export function ElementDefinitionTypeInput(props: ElementDefinitionTypeInputProps): JSX.Element {
  const property = props.property;
  const propertyType = props.elementDefinitionType.code as PropertyType;
  const name = props.name;
  const value = props.defaultValue;

  switch (propertyType) {
    case PropertyType.SystemString:
    case PropertyType.canonical:
    case PropertyType.string:
    case PropertyType.time:
    case PropertyType.uri:
    case PropertyType.url:
      return (
        <TextField
          type="text"
          name={name}
          testid={name}
          defaultValue={value}
          onChange={(e: React.ChangeEvent) => props.onChange && props.onChange((e.target as HTMLInputElement).value)}
          outcome={props.outcome}
        />
      );
    case PropertyType.date:
      return (
        <TextField
          type="date"
          name={name}
          testid={name}
          defaultValue={value}
          onChange={(e: React.ChangeEvent) => props.onChange && props.onChange((e.target as HTMLInputElement).value)}
          outcome={props.outcome}
        />
      );
    case PropertyType.dateTime:
    case PropertyType.instant:
      return (
        <TextField
          type="datetime-local"
          name={name}
          testid={name}
          defaultValue={value}
          onChange={(e: React.ChangeEvent) => props.onChange && props.onChange((e.target as HTMLInputElement).value)}
          outcome={props.outcome}
        />
      );
    case PropertyType.decimal:
    case PropertyType.integer:
    case PropertyType.positiveInt:
    case PropertyType.unsignedInt:
      return (
        <TextField
          type="number"
          step={propertyType === PropertyType.decimal ? 0.01 : 1}
          name={name}
          testid={name}
          defaultValue={value}
          onChange={(e: React.ChangeEvent) => {
            if (props.onChange) {
              props.onChange(parseFloat((e.target as HTMLInputElement).value));
            }
          }}
          outcome={props.outcome}
        />
      );
    case PropertyType.code:
      return <CodeInput property={property} name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.boolean:
      return (
        <input
          type="checkbox"
          name={name}
          data-testid={name}
          defaultChecked={!!value}
          value="true"
          onChange={(e: React.ChangeEvent) =>
            props.onChange && props.onChange((e.target as HTMLInputElement).value === 'true')
          }
        />
      );
    case PropertyType.markdown:
      return (
        <textarea
          name={name}
          defaultValue={value}
          onChange={(e: React.ChangeEvent) => props.onChange && props.onChange((e.target as HTMLInputElement).value)}
        />
      );
    case PropertyType.Address:
      return <AddressInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Annotation:
      return <AnnotationInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Attachment:
      return <AttachmentInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.CodeableConcept:
      return <CodeableConceptInput property={property} name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Coding:
      return <CodingInput property={property} name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.ContactPoint:
      return <ContactPointInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.HumanName:
      return <HumanNameInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Identifier:
      return <IdentifierInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Period:
      return <PeriodInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Quantity:
      return <QuantityInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Reference:
      return <ReferenceInput property={property} name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Extension:
      return <ExtensionInput name={name} defaultValue={value} onChange={props.onChange} />;
    default:
      return (
        <BackboneElementInput
          schema={props.schema}
          property={property}
          name={name}
          defaultValue={value}
          onChange={props.onChange}
          outcome={props.outcome}
        />
      );
  }
}
