// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Reference, Resource } from '@medplum/fhirtypes';
import type { JSX, ReactNode } from 'react';
import { useCallback } from 'react';
import type { AsyncAutocompleteOption, AsyncAutocompleteProps } from '../AsyncAutocomplete/AsyncAutocomplete';
import { MultiResourceInput } from './MultiResourceInput';

/**
 * @deprecated Use MultiResourceInput instead, which supports multiple default and selected values.
 */
export interface ResourceInputProps<T extends Resource = Resource> {
  readonly resourceType: T['resourceType'];
  readonly name: string;
  readonly defaultValue?: T | Reference<T>;
  readonly searchCriteria?: Record<string, string>;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly itemComponent?: (props: AsyncAutocompleteOption<T>) => JSX.Element | ReactNode;
  readonly onChange?: (value: T | undefined) => void;
  readonly disabled?: boolean;
  readonly label?: AsyncAutocompleteProps<T>['label'];
  readonly error?: AsyncAutocompleteProps<T>['error'];
}

/**
 * @param props - The props for the ResourceInput component.
 * @returns The ResourceInput component.
 */
export function ResourceInput<T extends Resource = Resource>(props: ResourceInputProps<T>): JSX.Element | null {
  const onChange = props.onChange;

  const handleChange = useCallback(
    (newResources: T[]) => {
      if (onChange) {
        onChange(newResources[0]);
      }
    },
    [onChange]
  );

  return (
    <MultiResourceInput<T>
      resourceType={props.resourceType}
      name={props.name}
      defaultValue={props.defaultValue ? [props.defaultValue] : undefined}
      searchCriteria={props.searchCriteria}
      placeholder={props.placeholder}
      required={props.required}
      itemComponent={props.itemComponent}
      onChange={handleChange}
      disabled={props.disabled}
      label={props.label}
      error={props.error}
      maxValues={1}
    />
  );
}
