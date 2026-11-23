// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Checkbox, Group, NativeSelect, Textarea, TextInput, Tooltip } from '@mantine/core';
import type { ExtendedInternalSchemaElement } from '@medplum/core';
import {
  applyDefaultValuesToElement,
  capitalize,
  getPathDifference,
  HTTP_HL7_ORG,
  isComplexTypeCode,
  isEmpty,
  isPopulated,
  PropertyType,
} from '@medplum/core';
import type { ElementDefinitionBinding, ElementDefinitionType } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useContext, useMemo, useState } from 'react';
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
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
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
import type { BaseInputProps, ComplexTypeInputProps, PrimitiveTypeInputProps } from './ResourcePropertyInput.utils';

// Boolean elements whose `meaningWhenMissing` says a missing value means true.
// Not every `active` qualifies: a missing `Cron.active` means inactive.
const BOOLEAN_PATHS_MISSING_MEANS_TRUE = new Set([
  'BodyStructure.active',
  'Group.active',
  'HealthcareService.active',
  'Linkage.active',
  'Organization.active',
  'OrganizationAffiliation.active',
  'Patient.active',
  'Practitioner.active',
  'PractitionerRole.active',
  'Project.active',
  'ProjectMembership.active',
  'RelatedPerson.active',
  'Schedule.active',
]);

export interface ResourcePropertyInputProps extends BaseInputProps {
  readonly property: ExtendedInternalSchemaElement;
  readonly name: string;
  readonly defaultPropertyType?: string;
  readonly defaultValue: any;
  readonly arrayElement?: boolean;
  readonly onChange?: (value: any, propName?: string) => void;
}

export function ResourcePropertyInput(props: ResourcePropertyInputProps): JSX.Element {
  const { property, name, onChange, defaultValue } = props;
  const defaultPropertyType =
    props.defaultPropertyType && props.defaultPropertyType !== 'undefined'
      ? props.defaultPropertyType
      : property.type[0].code;
  const propertyTypes = property.type as ElementDefinitionType[];

  if ((property.isArray || property.max > 1) && !props.arrayElement) {
    if (defaultPropertyType === PropertyType.Attachment) {
      return (
        <AttachmentArrayInput
          name={name}
          defaultValue={defaultValue}
          onChange={onChange}
          disabled={property.readonly}
        />
      );
    }

    // Extensions are a special type of array that shouldn't be indented
    const indent = propertyTypes[0]?.code !== PropertyType.Extension;
    return (
      <ResourceArrayInput
        property={property}
        name={name}
        path={props.path}
        valuePath={props.valuePath}
        defaultValue={defaultValue}
        indent={indent}
        onChange={onChange}
        outcome={props.outcome}
      />
    );
  } else if (propertyTypes.length > 1) {
    return <ElementDefinitionInputSelector elementDefinitionTypes={propertyTypes} {...props} />;
  } else {
    return (
      <ElementDefinitionTypeInput
        name={name}
        defaultValue={defaultValue}
        onChange={(newValue: any) => {
          if (props.onChange) {
            const newPropName = props.name.replace('[x]', capitalize(propertyTypes[0].code));
            props.onChange(newValue, newPropName);
          }
        }}
        outcome={props.outcome}
        elementDefinitionType={propertyTypes[0]}
        min={property.min}
        max={property.min}
        binding={property.binding}
        path={props.path}
        valuePath={props.valuePath}
        readOnly={property.readonly}
      />
    );
  }
}

export interface ElementDefinitionSelectorProps extends ResourcePropertyInputProps {
  readonly elementDefinitionTypes: ElementDefinitionType[];
}

export function ElementDefinitionInputSelector(props: ElementDefinitionSelectorProps): JSX.Element {
  const propertyTypes = props.elementDefinitionTypes;
  let initialPropertyType: ElementDefinitionType | undefined = undefined;
  if (props.defaultPropertyType) {
    initialPropertyType = propertyTypes.find((t) => t.code === props.defaultPropertyType);
  }
  if (!initialPropertyType) {
    initialPropertyType = propertyTypes[0];
  }
  const [selectedType, setSelectedType] = useState(initialPropertyType);
  return (
    <Group gap="xs" grow wrap="nowrap" align="flex-start">
      <NativeSelect
        disabled={props.property.readonly}
        style={{ width: '200px' }}
        defaultValue={selectedType.code}
        data-testid={props.name && props.name + '-selector'}
        onChange={(e) => {
          setSelectedType(
            propertyTypes.find(
              (type: ElementDefinitionType) => type.code === e.currentTarget.value
            ) as ElementDefinitionType
          );
        }}
        data={propertyTypes.map((type: ElementDefinitionType) => ({
          value: type.code,
          label: type.code,
        }))}
      />
      <ElementDefinitionTypeInput
        name={props.name}
        defaultValue={props.defaultValue}
        outcome={props.outcome}
        elementDefinitionType={selectedType}
        onChange={(newValue: any) => {
          if (props.onChange) {
            props.onChange(newValue, props.name.replace('[x]', capitalize(selectedType.code)));
          }
        }}
        min={props.property.min}
        max={props.property.max}
        binding={props.property.binding}
        path={props.property.path}
        valuePath={props.valuePath}
        readOnly={props.property.readonly}
      />
    </Group>
  );
}

// Avoiding optional props on lower-level components like to make it more difficult to misuse
export interface ElementDefinitionTypeInputProps extends Pick<
  ResourcePropertyInputProps,
  'name' | 'path' | 'valuePath' | 'defaultValue' | 'onChange' | 'outcome'
> {
  readonly elementDefinitionType: ElementDefinitionType;
  readonly min: number;
  readonly max: number;
  readonly binding: ElementDefinitionBinding | undefined;
  readonly readOnly?: boolean;
}

export function ElementDefinitionTypeInput(props: ElementDefinitionTypeInputProps): JSX.Element {
  const { name, onChange, outcome, binding, path, valuePath, readOnly } = props;
  const required = props.min !== undefined && props.min > 0;

  const propertyType = props.elementDefinitionType.code;

  const elementsContext = useContext(ElementsContext);
  const defaultValue = useMemo(() => {
    if (!isComplexTypeCode(propertyType)) {
      return props.defaultValue;
    }

    if (!isEmpty(props.defaultValue)) {
      return props.defaultValue;
    }

    const withDefaults = Object.create(null);
    if (elementsContext.path === props.path) {
      applyDefaultValuesToElement(withDefaults, elementsContext.elements);
    } else {
      const key = getPathDifference(elementsContext.path, props.path);
      if (key === undefined) {
        return props.defaultValue;
      }
      applyDefaultValuesToElement(withDefaults, elementsContext.elements, key);
    }

    if (isPopulated(withDefaults)) {
      return withDefaults;
    }

    return props.defaultValue;
  }, [propertyType, elementsContext.path, elementsContext.elements, props.path, props.defaultValue]);

  if (!propertyType) {
    return <div>Property type not specified </div>;
  }

  function getComplexInputProps(): ComplexTypeInputProps<any> {
    return { name, defaultValue, onChange, outcome, path, valuePath, disabled: readOnly };
  }

  function getPrimitiveInputProps(): PrimitiveTypeInputProps {
    const error = getErrorsForInput(props.outcome, valuePath ?? path);
    return {
      id: name,
      name,
      'data-testid': name,
      defaultValue,
      required,
      error,
      disabled: readOnly,
    };
  }

  switch (propertyType) {
    // 2.24.0.1 Primitive Types
    // https://www.hl7.org/fhir/datatypes.html#primitive

    case PropertyType.SystemString:
    case PropertyType.canonical:
    case PropertyType.id:
    case PropertyType.string:
    case PropertyType.uri:
    case PropertyType.url:
      if (props.path === 'Project.secret.value[x]' || props.path === 'ClientApplication.certificateTrustStore') {
        return (
          <SensitiveTextarea
            {...getPrimitiveInputProps()}
            onChange={(e) => {
              if (props.onChange) {
                props.onChange(e.currentTarget.value);
              }
            }}
          />
        );
      }

      return (
        <TextInput
          {...getPrimitiveInputProps()}
          onChange={(e) => {
            if (onChange) {
              onChange(e.currentTarget.value);
            }
          }}
        />
      );
    case PropertyType.date:
      return (
        <TextInput
          {...getPrimitiveInputProps()}
          type="date"
          onChange={(e) => {
            if (onChange) {
              onChange(e.currentTarget.value);
            }
          }}
        />
      );
    case PropertyType.time:
      return (
        <TextInput
          {...getPrimitiveInputProps()}
          type="time"
          step={1}
          onChange={(e) => {
            if (onChange) {
              onChange(e.currentTarget.value);
            }
          }}
        />
      );
    case PropertyType.dateTime:
    case PropertyType.instant:
      return <DateTimeInput {...getPrimitiveInputProps()} onChange={onChange} outcome={outcome} />;
    case PropertyType.decimal:
    case PropertyType.integer:
    case PropertyType.positiveInt:
    case PropertyType.unsignedInt:
      return (
        <TextInput
          {...getPrimitiveInputProps()}
          type="number"
          step={propertyType === PropertyType.decimal ? 'any' : '1'}
          onChange={(e) => {
            if (onChange) {
              const num = e.currentTarget.valueAsNumber;
              onChange(Number.isNaN(num) ? undefined : num);
            }
          }}
        />
      );
    case PropertyType.code:
      // overwrite getPrimitiveInputProps().error since FormSection already shows errors
      return (
        <CodeInput
          {...getPrimitiveInputProps()}
          error={undefined}
          onChange={onChange}
          binding={binding?.valueSet}
          creatable
          maxValues={1}
        />
      );
    case PropertyType.boolean:
      return <BooleanInput {...getPrimitiveInputProps()} path={path} onChange={onChange} />;
    case PropertyType.base64Binary:
    case PropertyType.markdown:
    case PropertyType.xhtml:
      return (
        <Textarea
          {...getPrimitiveInputProps()}
          spellCheck={propertyType !== PropertyType.base64Binary}
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
      return <AddressInput {...getComplexInputProps()} />;
    case PropertyType.Annotation:
      return <AnnotationInput {...getComplexInputProps()} />;
    case PropertyType.Attachment:
      return <AttachmentInput {...getComplexInputProps()} />;
    case PropertyType.CodeableConcept:
      return <CodeableConceptInput binding={binding?.valueSet} {...getComplexInputProps()} />;
    case PropertyType.Coding:
      return <CodingInput binding={binding?.valueSet} {...getComplexInputProps()} />;
    case PropertyType.ContactDetail:
      return <ContactDetailInput {...getComplexInputProps()} />;
    case PropertyType.ContactPoint:
      return <ContactPointInput {...getComplexInputProps()} />;
    case PropertyType.Extension:
      return <ExtensionInput {...getComplexInputProps()} propertyType={props.elementDefinitionType} />;
    case PropertyType.HumanName:
      return <HumanNameInput {...getComplexInputProps()} />;
    case PropertyType.Identifier:
      return <IdentifierInput {...getComplexInputProps()} />;
    case PropertyType.Money:
      return <MoneyInput {...getComplexInputProps()} />;
    case PropertyType.Period:
      return <PeriodInput {...getComplexInputProps()} />;
    case PropertyType.Duration:
    case PropertyType.Quantity:
      return <QuantityInput {...getComplexInputProps()} />;
    case PropertyType.Range:
      return <RangeInput {...getComplexInputProps()} />;
    case PropertyType.Ratio:
      return <RatioInput {...getComplexInputProps()} />;
    case PropertyType.Reference:
      return <ReferenceInput {...getComplexInputProps()} targetTypes={getTargetTypes(props.elementDefinitionType)} />;
    case PropertyType.Timing:
      return <TimingInput {...getComplexInputProps()} />;
    case PropertyType.Dosage:
    case PropertyType.UsageContext:
    default:
      return <BackboneElementInput {...getComplexInputProps()} typeName={propertyType} />;
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

interface BooleanInputProps extends PrimitiveTypeInputProps {
  readonly path: string;
  readonly onChange?: (checked: boolean) => void;
}

/**
 * Checkbox for a boolean element. When the value is missing but the element's definition says
 * missing means true, the box is checked with an outline and a tooltip, since a search for
 * `active=true` will not match the resource.
 * @param props - The BooleanInput React props.
 * @returns The BooleanInput React node.
 */
function BooleanInput(props: BooleanInputProps): JSX.Element {
  const { path, onChange, ...inputProps } = props;
  const [inferred, setInferred] = useState(
    () => isEmpty(inputProps.defaultValue) && BOOLEAN_PATHS_MISSING_MEANS_TRUE.has(path)
  );
  const field = path.split('.').pop();
  // Always render the Tooltip so the Checkbox is not remounted (losing focus) when the value is set
  return (
    <Tooltip.Floating
      label={`Not set, so treated as true. A search for ${field}=true will not match it.`}
      disabled={!inferred}
    >
      <Checkbox
        {...inputProps}
        variant={inferred ? 'outline' : undefined}
        defaultChecked={inferred || Boolean(inputProps.defaultValue)}
        onChange={(e) => {
          setInferred(false);
          onChange?.(e.currentTarget.checked);
        }}
      />
    </Tooltip.Floating>
  );
}
