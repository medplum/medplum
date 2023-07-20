import { Group, NativeSelect, TextInput } from '@mantine/core';
import { createReference } from '@medplum/core';
import { Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { ResourceInput } from '../ResourceInput/ResourceInput';

export interface ReferenceInputProps {
  name: string;
  placeholder?: string;
  defaultValue?: Reference;
  targetTypes?: string[];
  autoFocus?: boolean;
  onChange?: (value: Reference | undefined) => void;
}

export function ReferenceInput(props: ReferenceInputProps): JSX.Element {
  const targetTypes = getTargetTypes(props.targetTypes);
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
    <Group spacing="xs" grow noWrap>
      {targetTypes ? (
        <NativeSelect
          data-autofocus={props.autoFocus}
          data-testid="reference-input-resource-type-select"
          defaultValue={resourceType}
          autoFocus={props.autoFocus}
          onChange={(e) => setResourceType(e.currentTarget.value)}
          data={targetTypes}
        />
      ) : (
        <TextInput
          data-autofocus={props.autoFocus}
          data-testid="reference-input-resource-type-input"
          defaultValue={resourceType}
          autoFocus={props.autoFocus}
          onChange={(e) => setResourceType(e.currentTarget.value)}
        />
      )}
      <ResourceInput
        resourceType={resourceType as ResourceType}
        name={props.name + '-id'}
        placeholder={props.placeholder}
        defaultValue={value}
        onChange={(item: Resource | undefined) => {
          setValueHelper(item ? createReference(item) : undefined);
        }}
      />
    </Group>
  );
}

function getTargetTypes(targetTypes: string[] | undefined): string[] | undefined {
  if (!targetTypes || targetTypes.length === 0 || (targetTypes.length === 1 && targetTypes[0] === 'Resource')) {
    return undefined;
  }
  return targetTypes;
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
