import { createReference } from '@medplum/core';
import { ElementDefinition, Reference, Resource } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { Input } from './Input';
import { InputRow } from './InputRow';
import { ResourceInput } from './ResourceInput';
import { Select } from './Select';

export interface ReferenceInputProps {
  property?: ElementDefinition;
  name: string;
  defaultValue?: Reference;
  onChange?: (value: Reference | undefined) => void;
}

export function ReferenceInput(props: ReferenceInputProps): JSX.Element {
  const targetTypes = getTargetTypes(props.property);
  const initialResourceType = getInitialResourceType(props.defaultValue, targetTypes);
  const [value, setValue] = useState<Reference | undefined>(props.defaultValue);
  const [resourceType, setResourceType] = useState<string | undefined>(initialResourceType);

  const valueRef = useRef<Reference>();
  valueRef.current = value;

  const resourceTypeRef = useRef<string>();
  resourceTypeRef.current = resourceType;

  function setValueHelper(newValue: Reference | undefined): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <InputRow>
      {targetTypes ? (
        <Select testid="reference-input-resource-type-select" defaultValue={resourceType} onChange={setResourceType}>
          {targetTypes.map((targetType) => (
            <option key={targetType} value={targetType}>
              {targetType}
            </option>
          ))}
        </Select>
      ) : (
        <Input testid="reference-input-resource-type-input" defaultValue={resourceType} onChange={setResourceType} />
      )}
      {resourceType && (
        <ResourceInput
          resourceType={resourceType}
          name={props.name + '-id'}
          defaultValue={value}
          onChange={(item: Resource | undefined) => {
            setValueHelper(item ? createReference(item) : undefined);
          }}
        />
      )}
    </InputRow>
  );
}

function getTargetTypes(property?: ElementDefinition): string[] | undefined {
  return property?.type?.[0]?.targetProfile?.map((p) => p.split('/').pop() as string);
}

function getInitialResourceType(
  defaultValue: Reference | undefined,
  targetTypes: string[] | undefined
): string | undefined {
  const defaultValueResourceType = defaultValue?.reference?.split('/')[0];
  if (defaultValueResourceType) {
    return defaultValueResourceType;
  }

  if (targetTypes && targetTypes.length > 0) {
    return targetTypes[0];
  }

  return undefined;
}
