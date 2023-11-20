import { Checkbox, Group, NativeSelect, Textarea, TextInput } from '@mantine/core';
import { capitalize, InternalSchemaElement, PropertyType } from '@medplum/core';
import { ElementDefinitionBinding, ElementDefinitionType, OperationOutcome } from '@medplum/fhirtypes';
import { useState } from 'react';
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
  property: InternalSchemaElement;
  name: string;
  defaultPropertyType?: string | undefined;
  defaultValue: any;
  arrayElement?: boolean | undefined;
  onChange: ((value: any, propName?: string) => void) | undefined;
  outcome?: OperationOutcome | undefined;
}

export function ResourcePropertyInput(props: ResourcePropertyInputProps): JSX.Element {
  const { property, name, defaultValue, onChange } = props;
  const defaultPropertyType = props.defaultPropertyType ?? property.type[0].code;

  const propertyTypes = property.type as ElementDefinitionType[];

  if (property.max > 1 && !props.arrayElement) {
    if (defaultPropertyType === PropertyType.Attachment) {
      return <AttachmentArrayInput name={name} defaultValue={defaultValue} onChange={onChange} />;
    }

    // Extensions are a special type of array that shouldn't be indented
    const indent = propertyTypes[0]?.code !== PropertyType.Extension;
    return (
      <ResourceArrayInput
        property={property}
        name={name}
        defaultValue={defaultValue}
        indent={indent}
        onChange={onChange}
      />
    );
  }

  if (propertyTypes.length > 1) {
    if (propertyTypes.some((type) => type.code === 'Extension')) {
      console.warn('More than one type for an Extension', propertyTypes);
    }
    return <ElementDefinitionInputSelector elementDefinitionTypes={propertyTypes} {...props} />;
  } else {
    return (
      <ElementDefinitionTypeInput
        name={name}
        defaultValue={defaultValue}
        onChange={(newValue: any) => {
          if (props.onChange) {
            const newPropName = props.name.replace('[x]', capitalize(propertyTypes[0].code as string));
            console.log('ResourceProperty', newPropName, JSON.stringify(newValue));
            props.onChange(newValue, newPropName);
          }
        }}
        outcome={undefined}
        elementDefinitionType={propertyTypes[0]}
        min={property.min}
        max={property.min}
        binding={property.binding}
      />
    );
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
        name={props.name}
        defaultValue={props.defaultValue}
        outcome={props.outcome}
        elementDefinitionType={selectedType}
        onChange={(newValue: any) => {
          if (props.onChange) {
            props.onChange(newValue, props.name.replace('[x]', capitalize(selectedType.code as string)));
          }
        }}
        min={props.property.min}
        max={props.property.max}
        binding={props.property.binding}
      />
    </Group>
  );
}

// Avoiding optional props on lower-level components like to make it more difficult to misuse
export type ElementDefinitionTypeInputProps = {
  name: ResourcePropertyInputProps['name'];
  defaultValue: ResourcePropertyInputProps['defaultValue'];
  onChange: ResourcePropertyInputProps['onChange'];
  outcome: ResourcePropertyInputProps['outcome'];
  elementDefinitionType: ElementDefinitionType;
  min: number;
  max: number;
  binding: ElementDefinitionBinding | undefined;
};

export function ElementDefinitionTypeInput(props: ElementDefinitionTypeInputProps): JSX.Element {
  const { name, defaultValue: value, onChange, outcome, binding } = props;
  const required = props.min !== undefined && props.min > 0;

  const propertyType = props.elementDefinitionType.code as string;

  if (!propertyType) {
    return <div>Property type not specified </div>;
  }

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
            if (onChange) {
              onChange(e.currentTarget.value);
            }
          }}
          error={getErrorsForInput(outcome, name)}
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
            if (onChange) {
              onChange(e.currentTarget.value);
            }
          }}
          error={getErrorsForInput(outcome, name)}
        />
      );
    case PropertyType.dateTime:
    case PropertyType.instant:
      return <DateTimeInput name={name} defaultValue={value} onChange={onChange} outcome={outcome} />;
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
            if (onChange) {
              onChange(e.currentTarget.valueAsNumber);
            }
          }}
        />
      );
    case PropertyType.code:
      return <CodeInput binding={binding?.valueSet} name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.boolean:
      return (
        <Checkbox
          id={name}
          name={name}
          data-testid={name}
          defaultChecked={!!value}
          onChange={(e) => {
            if (onChange) {
              onChange(e.currentTarget.checked);
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
            if (onChange) {
              onChange(e.currentTarget.value);
            }
          }}
        />
      );

    // 2.24.0.2 Complex Types
    // https://www.hl7.org/fhir/datatypes.html#complex

    case PropertyType.Address:
      return <AddressInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.Annotation:
      return <AnnotationInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.Attachment:
      return <AttachmentInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.CodeableConcept:
      return <CodeableConceptInput binding={binding?.valueSet} name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.Coding:
      return <CodingInput binding={binding?.valueSet} name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.ContactDetail:
      return <ContactDetailInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.ContactPoint:
      return <ContactPointInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.Extension:
      return (
        <ExtensionInput
          name={name}
          defaultValue={value}
          onChange={onChange}
          propertyType={props.elementDefinitionType}
        />
      );
    case PropertyType.HumanName:
      return <HumanNameInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.Identifier:
      return <IdentifierInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.Money:
      return <MoneyInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.Period:
      return <PeriodInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.Duration:
    case PropertyType.Quantity:
      return <QuantityInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.Range:
      return <RangeInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.Ratio:
      return <RatioInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.Reference:
      return (
        <ReferenceInput
          name={name}
          defaultValue={value}
          targetTypes={getTargetTypes(props.elementDefinitionType)}
          onChange={onChange}
        />
      );
    case PropertyType.Timing:
      return <TimingInput name={name} defaultValue={value} onChange={onChange} />;
    case PropertyType.Dosage:
    case PropertyType.UsageContext:
      return (
        <BackboneElementInput
          typeName={propertyType}
          defaultValue={value}
          onChange={onChange}
          outcome={outcome}
          type={propertyType}
        />
      );
    default:
      return (
        <BackboneElementInput
          typeName={propertyType}
          defaultValue={value}
          onChange={onChange}
          outcome={outcome}
          type={propertyType}
        />
      );
  }
}

function getTargetTypes(elementDefinitionType?: ElementDefinitionType): string[] | undefined {
  return elementDefinitionType?.targetProfile?.map((p) => p.split('/').pop() as string);
}
