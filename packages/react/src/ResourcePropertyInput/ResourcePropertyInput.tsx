import { Checkbox, Group, NativeSelect, Textarea, TextInput } from '@mantine/core';
import { capitalize, getElementDefinitionTypeName, PropertyType } from '@medplum/core';
import { ElementDefinition, ElementDefinitionType, OperationOutcome } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { AddressInput } from '../AddressInput/AddressInput';
import { AnnotationInput } from '../AnnotationInput/AnnotationInput';
import { AttachmentArrayInput } from '../AttachmentArrayInput/AttachmentArrayInput';
import { AttachmentInput } from '../AttachmentInput/AttachmentInput';
import { BackboneElementInput } from '../BackboneElementInput/BackboneElementInput';
import { CodeableConceptInput } from '../CodeableConceptInput/CodeableConceptInput';
import { CodeInput } from '../CodeInput/CodeInput';
import { CodingInput } from '../CodingInput/CodingInput';
import { ContactDetailInput } from '../ContactDetailInput/ContactDetailInput';
import { ContactPointInput } from '../ContactPointInput/ContactPointInput';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { ExtensionInput } from '../ExtensionInput/ExtensionInput';
import { HumanNameInput } from '../HumanNameInput/HumanNameInput';
import { IdentifierInput } from '../IdentifierInput/IdentifierInput';
import { MoneyInput } from '../MoneyInput/MoneyInput';
import { PeriodInput } from '../PeriodInput/PeriodInput';
import { QuantityInput } from '../QuantityInput/QuantityInput';
import { RangeInput } from '../RangeInput/RangeInput';
import { RatioInput } from '../RatioInput/RatioInput';
import { ReferenceInput } from '../ReferenceInput/ReferenceInput';
import { ResourceArrayInput } from '../ResourceArrayInput/ResourceArrayInput';
import { TimingInput } from '../TimingInput/TimingInput';
import { getErrorsForInput } from '../utils/outcomes';

export interface ResourcePropertyInputProps {
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
    if (propertyType === PropertyType.Attachment) {
      return <AttachmentArrayInput name={name} defaultValue={value} onChange={props.onChange} />;
    }
    return <ResourceArrayInput property={property} name={name} defaultValue={value} onChange={props.onChange} />;
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
  let initialPropertyType: ElementDefinitionType | undefined = undefined;
  if (props.defaultPropertyType) {
    initialPropertyType = propertyTypes.find((t) => t.code === props.defaultPropertyType) as ElementDefinitionType;
  }
  if (!initialPropertyType) {
    initialPropertyType = propertyTypes[0];
  }
  const [selectedType, setSelectedType] = useState(initialPropertyType);
  return (
    <Group spacing="xs" grow noWrap>
      <NativeSelect
        style={{ width: '200px' }}
        defaultValue={selectedType.code}
        onChange={(e) => {
          setSelectedType(
            propertyTypes.find(
              (type: ElementDefinitionType) => type.code === e.currentTarget.value
            ) as ElementDefinitionType
          );
        }}
        data={propertyTypes.map((type: ElementDefinitionType) => ({
          value: type.code as string,
          label: type.code as string,
        }))}
      />
      <ElementDefinitionTypeInput
        {...props}
        elementDefinitionType={selectedType}
        onChange={(newValue: any) => {
          if (props.onChange) {
            props.onChange(newValue, props.name.replace('[x]', capitalize(selectedType.code as string)));
          }
        }}
      />
    </Group>
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
  const required = property.min !== undefined && property.min > 0;

  switch (propertyType) {
    // 2.24.0.1 Primitive Types
    // https://www.hl7.org/fhir/datatypes.html#primitive

    case PropertyType.SystemString:
    case PropertyType.canonical:
    case PropertyType.string:
    case PropertyType.time:
    case PropertyType.uri:
    case PropertyType.url:
      return (
        <TextInput
          id={name}
          name={name}
          data-testid={name}
          defaultValue={value}
          required={required}
          onChange={(e) => {
            if (props.onChange) {
              props.onChange(e.currentTarget.value);
            }
          }}
          error={getErrorsForInput(props.outcome, name)}
        />
      );
    case PropertyType.date:
      return (
        <TextInput
          type="date"
          id={name}
          name={name}
          data-testid={name}
          defaultValue={value}
          required={required}
          onChange={(e) => {
            if (props.onChange) {
              props.onChange(e.currentTarget.value);
            }
          }}
          error={getErrorsForInput(props.outcome, name)}
        />
      );
    case PropertyType.dateTime:
    case PropertyType.instant:
      return <DateTimeInput name={name} defaultValue={value} onChange={props.onChange} outcome={props.outcome} />;
    case PropertyType.decimal:
    case PropertyType.integer:
    case PropertyType.positiveInt:
    case PropertyType.unsignedInt:
      return (
        <TextInput
          type="number"
          step={propertyType === PropertyType.decimal ? 'any' : '1'}
          id={name}
          name={name}
          data-testid={name}
          defaultValue={value}
          required={required}
          onChange={(e) => {
            if (props.onChange) {
              props.onChange(e.currentTarget.valueAsNumber);
            }
          }}
        />
      );
    case PropertyType.code:
      return <CodeInput property={property} name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.boolean:
      return (
        <Checkbox
          id={name}
          name={name}
          data-testid={name}
          defaultChecked={!!value}
          onChange={(e) => {
            if (props.onChange) {
              props.onChange(e.currentTarget.checked);
            }
          }}
        />
      );
    case PropertyType.markdown:
      return (
        <Textarea
          id={name}
          name={name}
          data-testid={name}
          defaultValue={value}
          required={required}
          onChange={(e) => {
            if (props.onChange) {
              props.onChange(e.currentTarget.value);
            }
          }}
        />
      );

    // 2.24.0.2 Complex Types
    // https://www.hl7.org/fhir/datatypes.html#complex

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
    case PropertyType.ContactDetail:
      return <ContactDetailInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.ContactPoint:
      return <ContactPointInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Extension:
      return <ExtensionInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.HumanName:
      return <HumanNameInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Identifier:
      return <IdentifierInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Money:
      return <MoneyInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Period:
      return <PeriodInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Duration:
    case PropertyType.Quantity:
      return <QuantityInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Range:
      return <RangeInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Ratio:
      return <RatioInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Reference:
      return (
        <ReferenceInput
          name={name}
          defaultValue={value}
          targetTypes={getTargetTypes(property)}
          onChange={props.onChange}
        />
      );
    case PropertyType.Timing:
      return <TimingInput name={name} defaultValue={value} onChange={props.onChange} />;
    case PropertyType.Dosage:
    case PropertyType.UsageContext:
      return (
        <BackboneElementInput
          typeName={propertyType}
          defaultValue={value}
          onChange={props.onChange}
          outcome={props.outcome}
        />
      );
    default:
      return (
        <BackboneElementInput
          typeName={getElementDefinitionTypeName(property)}
          defaultValue={value}
          onChange={props.onChange}
          outcome={props.outcome}
        />
      );
  }
}

function getTargetTypes(property?: ElementDefinition): string[] | undefined {
  return property?.type?.[0]?.targetProfile?.map((p) => p.split('/').pop() as string);
}
