import { Checkbox, TextInput } from '@mantine/core';
import { getSearchParameterDetails, SearchParameterType } from '@medplum/core';
import { Quantity, Reference, SearchParameter } from '@medplum/fhirtypes';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { QuantityInput } from '../QuantityInput/QuantityInput';
import { ReferenceInput } from '../ReferenceInput/ReferenceInput';

export interface SearchFilterValueInputProps {
  readonly resourceType: string;
  readonly searchParam: SearchParameter;
  readonly defaultValue?: string;
  readonly autoFocus?: boolean;
  readonly onChange: (value: string) => void;
}

export function SearchFilterValueInput(props: SearchFilterValueInputProps): JSX.Element | null {
  const details = getSearchParameterDetails(props.resourceType, props.searchParam);
  const name = 'filter-value';

  switch (details.type) {
    case SearchParameterType.REFERENCE:
      return (
        <ReferenceInput
          name={name}
          defaultValue={props.defaultValue ? { reference: props.defaultValue } : undefined}
          targetTypes={props.searchParam.target}
          autoFocus={props.autoFocus}
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
          data-autofocus={props.autoFocus}
          data-testid={name}
          defaultChecked={props.defaultValue === 'true'}
          autoFocus={props.autoFocus}
          onChange={(e) => props.onChange(e.currentTarget.checked.toString())}
        />
      );

    case SearchParameterType.DATE:
      return (
        <TextInput
          type="date"
          name={name}
          data-autofocus={props.autoFocus}
          data-testid={name}
          defaultValue={props.defaultValue}
          autoFocus={props.autoFocus}
          onChange={(e) => props.onChange(e.currentTarget.value)}
        />
      );

    case SearchParameterType.DATETIME:
      return (
        <DateTimeInput
          name={name}
          defaultValue={props.defaultValue}
          autoFocus={props.autoFocus}
          onChange={props.onChange}
        />
      );

    case SearchParameterType.NUMBER:
      return (
        <TextInput
          type="number"
          name={name}
          data-autofocus={props.autoFocus}
          data-testid={name}
          defaultValue={props.defaultValue}
          autoFocus={props.autoFocus}
          onChange={(e) => props.onChange(e.currentTarget.value)}
        />
      );

    case SearchParameterType.QUANTITY:
      return (
        <QuantityInput
          name={name}
          path=""
          defaultValue={tryParseQuantity(props.defaultValue)}
          autoFocus={props.autoFocus}
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
          name={name}
          data-autofocus={props.autoFocus}
          data-testid={name}
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
