import { ResourceType } from '@medplum/fhirtypes';
import React, { useCallback, useState } from 'react';
import { CodeInput } from '../CodeInput/CodeInput';

export interface ResourceTypeInputProps {
  name: string;
  placeholder?: string;
  defaultValue?: ResourceType;
  targetTypes?: string[];
  autoFocus?: boolean;
  testId?: string;
  onChange?: (value: ResourceType | undefined) => void;
}

export function ResourceTypeInput(props: ResourceTypeInputProps): JSX.Element {
  const [resourceType, setResourceType] = useState<string | undefined>(props.defaultValue);
  const onChange = props.onChange;

  const setResourceTypeWrapper = useCallback(
    (newResourceType: string | undefined) => {
      setResourceType(newResourceType);
      if (onChange) {
        onChange(newResourceType as ResourceType);
      }
    },
    [onChange]
  );

  return (
    <CodeInput
      data-autofocus={props.autoFocus}
      data-testid={props.testId}
      defaultValue={resourceType}
      onChange={setResourceTypeWrapper}
      name={props.name}
      placeholder={props.placeholder}
      property={{
        binding: {
          valueSet: 'https://medplum.com/fhir/ValueSet/resource-types',
        },
      }}
      creatable={false}
      maxSelectedValues={0}
      clearSearchOnChange={true}
      clearable={false}
    />
  );
}
