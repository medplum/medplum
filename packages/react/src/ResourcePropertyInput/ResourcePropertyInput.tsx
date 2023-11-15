import { Checkbox, Group, NativeSelect, Textarea, TextInput } from '@mantine/core';
import { capitalize, HTTP_HL7_ORG, InternalSchemaElement, PropertyType } from '@medplum/core';
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
import { SensitiveTextarea } from '../SensitiveTextarea/SensitiveTextarea';
import { TimingInput } from '../TimingInput/TimingInput';
import { getErrorsForInput } from '../utils/outcomes';
import { ComplexTypeInputProps } from './ResourcePropertyInput.utils';

export interface ResourcePropertyInputProps {
  property: InternalSchemaElement;
  name: string;
  defaultPropertyType?: string | undefined;
  defaultValue: any;
  arrayElement?: boolean | undefined;
  onChange: ((value: any, propName?: string) => void) | undefined;
  outcome: OperationOutcome | undefined;
}

export function ResourcePropertyInput(props: ResourcePropertyInputProps): JSX.Element {
  const { property, name, defaultValue, onChange } = props;
  const defaultPropertyType =
    props.defaultPropertyType && props.defaultPropertyType !== 'undefined'
      ? props.defaultPropertyType
      : property.type[0].code;

  const propertyTypes = property.type as ElementDefinitionType[];

  if ((property.isArray || property.max > 1) && !props.arrayElement) {
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
        outcome={props.outcome}
      />
    );
  }

  if (propertyTypes.length > 1) {
    return <ElementDefinitionInputSelector elementDefinitionTypes={propertyTypes} {...props} />;
  } else {
    return (
      <ElementDefinitionTypeInput
        name={name}
        defaultValue={defaultValue}
        onChange={(newValue: any) => {
          if (props.onChange) {
            const newPropName = props.name.replace('[x]', capitalize(propertyTypes[0].code as string));
            props.onChange(newValue, newPropName);
          }
        }}
        outcome={props.outcome}
        elementDefinitionType={propertyTypes[0]}
        min={property.min}
        max={property.min}
        binding={property.binding}
        path={property.path}
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
    <Group gap="xs" grow wrap="nowrap" align="flex-start">
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
        path={props.property.path}
      />
    </Group>
  );
}

// Avoiding optional props on lower-level components like to make it more difficult to misuse
export type ElementDefinitionTypeInputProps = {
  name: ResourcePropertyInputProps['name'];
  path: string;
  defaultValue: ResourcePropertyInputProps['defaultValue'];
  onChange: ResourcePropertyInputProps['onChange'];
  outcome: ResourcePropertyInputProps['outcome'];
  elementDefinitionType: ElementDefinitionType;
  min: number;
  max: number;
  binding: ElementDefinitionBinding | undefined;
};

export function ElementDefinitionTypeInput(props: ElementDefinitionTypeInputProps): JSX.Element {
  const { name, defaultValue, onChange, outcome, binding, path } = props;
  const required = props.min !== undefined && props.min > 0;

  const propertyType = props.elementDefinitionType.code;

  if (!propertyType) {
    return <div>Property type not specified </div>;
  }

  const properties: ComplexTypeInputProps<any> = { name, defaultValue, onChange, outcome, path };

  switch (propertyType) {
    // 2.24.0.1 Primitive Types
    // https://www.hl7.org/fhir/datatypes.html#primitive

    case PropertyType.SystemString:
    case PropertyType.canonical:
    case PropertyType.string:
    case PropertyType.time:
    case PropertyType.uri:
    case PropertyType.url:
      if (props.path === 'Project.secret.value[x]') {
        return (
          <SensitiveTextarea
            id={name}
            name={name}
            data-testid={name}
            defaultValue={defaultValue}
            required={required}
            onChange={(e) => {
              if (props.onChange) {
                props.onChange(e.currentTarget.value);
              }
            }}
            error={getErrorsForInput(props.outcome, name)}
          />
        );
      }

      return (
        <TextInput
          id={name}
          name={name}
          data-testid={name}
          defaultValue={defaultValue}
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
          defaultValue={defaultValue}
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
      return <DateTimeInput name={name} defaultValue={defaultValue} onChange={onChange} outcome={outcome} />;
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
          defaultValue={defaultValue}
          required={required}
          onChange={(e) => {
            if (onChange) {
              onChange(e.currentTarget.valueAsNumber);
            }
          }}
        />
      );
    case PropertyType.code:
      return <CodeInput {...properties} binding={binding?.valueSet} />;
    case PropertyType.boolean:
      return (
        <Checkbox
          id={name}
          name={name}
          data-testid={name}
          defaultChecked={!!defaultValue}
          onChange={(e) => {
            if (onChange) {
              onChange(e.currentTarget.checked);
            }
          }}
        />
      );
    case PropertyType.base64Binary:
    case PropertyType.markdown:
      return (
        <Textarea
          id={name}
          spellCheck={propertyType !== PropertyType.base64Binary}
          name={name}
          data-testid={name}
          defaultValue={defaultValue}
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
      return <AddressInput {...properties} />;
    case PropertyType.Annotation:
      return <AnnotationInput {...properties} />;
    case PropertyType.Attachment:
      return <AttachmentInput {...properties} />;
    case PropertyType.CodeableConcept:
      return <CodeableConceptInput binding={binding?.valueSet} {...properties} />;
    case PropertyType.Coding:
      return <CodingInput binding={binding?.valueSet} {...properties} />;
    case PropertyType.ContactDetail:
      return <ContactDetailInput {...properties} />;
    case PropertyType.ContactPoint:
      return <ContactPointInput {...properties} />;
    case PropertyType.Extension:
      return <ExtensionInput {...properties} propertyType={props.elementDefinitionType} />;
    case PropertyType.HumanName:
      return <HumanNameInput {...properties} />;
    case PropertyType.Identifier:
      return <IdentifierInput {...properties} />;
    case PropertyType.Money:
      return <MoneyInput {...properties} />;
    case PropertyType.Period:
      return <PeriodInput {...properties} />;
    case PropertyType.Duration:
    case PropertyType.Quantity:
      return <QuantityInput {...properties} />;
    case PropertyType.Range:
      return <RangeInput {...properties} />;
    case PropertyType.Ratio:
      return <RatioInput {...properties} />;
    case PropertyType.Reference:
      return <ReferenceInput {...properties} targetTypes={getTargetTypes(props.elementDefinitionType)} />;
    case PropertyType.Timing:
      return <TimingInput {...properties} />;
    case PropertyType.Dosage:
    case PropertyType.UsageContext:
    default:
      return (
        <BackboneElementInput
          typeName={propertyType}
          defaultValue={defaultValue}
          onChange={onChange}
          outcome={outcome}
        />
      );
  }
}

const RESOURCE_TYPE_URL_PREFIXES = [
  `${HTTP_HL7_ORG}/fhir/StructureDefinition/`,
  'https://medplum.com/fhir/StructureDefinition/',
];
function getTargetTypes(elementDefinitionType?: ElementDefinitionType): string[] | undefined {
  return elementDefinitionType?.targetProfile?.map((p) => {
    const resourceTypePrefix = RESOURCE_TYPE_URL_PREFIXES.find((prefix) => p.startsWith(prefix));
    if (resourceTypePrefix) {
      return p.slice(resourceTypePrefix.length);
    } else {
      return p;
    }
  });
}
