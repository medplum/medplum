import { getSearchParameterDetails, IndexedStructureDefinition, SearchParameterType } from '@medplum/core';
import { Quantity, Reference, SearchParameter } from '@medplum/fhirtypes';
import React from 'react';
import { DateTimeInput } from './DateTimeInput';
import { Input } from './Input';
import { QuantityInput } from './QuantityInput';
import { ReferenceInput } from './ReferenceInput';

export interface SearchFilterValueInputProps {
  schema: IndexedStructureDefinition;
  resourceType: string;
  searchParam: SearchParameter;
  defaultValue?: string;
  onChange: (value: string) => void;
}

export function SearchFilterValueInput(props: SearchFilterValueInputProps): JSX.Element | null {
  const details = getSearchParameterDetails(props.schema, props.resourceType, props.searchParam);
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
        <input
          type="checkbox"
          name={name}
          data-testid={name}
          defaultChecked={props.defaultValue === 'true'}
          value="true"
          onChange={(e: React.ChangeEvent) => props.onChange((e.target as HTMLInputElement).checked ? 'true' : 'false')}
        />
      );

    case SearchParameterType.DATE:
      return <Input type="date" testid={name} defaultValue={props.defaultValue} onChange={props.onChange} />;

    case SearchParameterType.DATETIME:
      return <DateTimeInput testid={name} defaultValue={props.defaultValue} onChange={props.onChange} />;

    case SearchParameterType.NUMBER:
      return <Input type="number" defaultValue={props.defaultValue} onChange={props.onChange} />;

    case SearchParameterType.QUANTITY:
      return (
        <QuantityInput
          name={name}
          defaultValue={{}}
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
      return <Input testid={name} defaultValue={props.defaultValue} onChange={props.onChange} />;
  }
}
