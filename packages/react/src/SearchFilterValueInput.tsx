import { Checkbox, Group, NumberInput, TextInput } from '@mantine/core';
import { DatePicker, TimeInput } from '@mantine/dates';
import { getSearchParameterDetails, SearchParameterType } from '@medplum/core';
import { Quantity, Reference, SearchParameter } from '@medplum/fhirtypes';
import React from 'react';
import { QuantityInput } from './QuantityInput';
import { ReferenceInput } from './ReferenceInput';

export interface SearchFilterValueInputProps {
  resourceType: string;
  searchParam: SearchParameter;
  defaultValue?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}

export function SearchFilterValueInput(props: SearchFilterValueInputProps): JSX.Element | null {
  const details = getSearchParameterDetails(props.resourceType, props.searchParam);
  const name = 'filter-value';

  switch (details.type) {
    case SearchParameterType.REFERENCE:
      return (
        <ReferenceInput
          name={name}
          defaultValue={{ reference: props.defaultValue }}
          targetTypes={props.searchParam?.target}
          onChange={(newReference: Reference | undefined) => {
            if (newReference) {
              props.onChange(newReference.reference as string);
            } else {
              props.onChange('');
            }
          }}
        />
      );

    case SearchParameterType.BOOLEAN:
      return (
        <Checkbox
          name={name}
          checked={props.defaultValue === 'true'}
          onChange={(newValue) => props.onChange(newValue.toString())}
        />
      );

    case SearchParameterType.DATE:
      return (
        <DatePicker
          defaultValue={props.defaultValue ? new Date(props.defaultValue) : undefined}
          onChange={(newValue) => props.onChange(newValue?.toISOString() || '')}
        />
      );

    case SearchParameterType.DATETIME:
      return (
        <Group>
          <DatePicker
            name={name}
            defaultValue={props.defaultValue ? new Date(props.defaultValue) : undefined}
            onChange={(newValue) => props.onChange(newValue?.toISOString() || '')}
          />
          <TimeInput
            name={name}
            defaultValue={props.defaultValue ? new Date(props.defaultValue) : undefined}
            onChange={(newValue) => props.onChange(newValue?.toISOString() || '')}
          />
        </Group>
      );

    case SearchParameterType.NUMBER:
      return (
        <NumberInput
          defaultValue={props.defaultValue ? parseFloat(props.defaultValue) : undefined}
          onChange={(newValue) => props.onChange(newValue?.toString() || '')}
        />
      );

    case SearchParameterType.QUANTITY:
      return (
        <QuantityInput
          name={name}
          defaultValue={tryParseQuantity(props.defaultValue)}
          onChange={(newQuantity: Quantity | undefined) => {
            if (newQuantity) {
              props.onChange(`${newQuantity.value}`);
            } else {
              props.onChange('');
            }
          }}
        />
      );

    default:
      return (
        <TextInput
          defaultValue={props.defaultValue}
          autoFocus={props.autoFocus}
          onChange={(e) => props.onChange(e.currentTarget.value)}
          placeholder="Search value"
        />
      );
  }
}

function tryParseQuantity(value: string | undefined): Quantity | undefined {
  if (value) {
    const [valueString, systemString, unitString] = value.split('|');
    if (valueString) {
      return {
        value: parseFloat(valueString),
        system: systemString,
        unit: unitString,
      };
    }
  }
  return undefined;
}
