import { Group, NativeSelect, TextInput } from '@mantine/core';
import { Address } from '@medplum/fhirtypes';
import { useContext, useMemo, useRef, useState } from 'react';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';

function getLine(address: Address, index: number): string {
  return address.line && address.line.length > index ? address.line[index] : '';
}

function setLine(address: Address, index: number, str: string): Address {
  const line: string[] = address.line || [];
  while (line.length <= index) {
    line.push('');
  }
  line[index] = str;
  return { ...address, line };
}

export type AddressInputProps = ComplexTypeInputProps<Address>;

export function AddressInput(props: AddressInputProps): JSX.Element {
  const [value, setValue] = useState<Address>(props.defaultValue || {});

  const valueRef = useRef<Address>();
  valueRef.current = value;

  const { getExtendedProps } = useContext(ElementsContext);
  const [useProps, typeProps, line1Props, line2Props, cityProps, stateProps, postalCodeProps] = useMemo(
    () =>
      ['use', 'type', 'line1', 'line2', 'city', 'state', 'postalCode'].map((field) =>
        getExtendedProps(props.path + '.' + field)
      ),
    [getExtendedProps, props.path]
  );

  // TODO{profiles} is it worth the complexity of subbing in an autocomplete input when
  // a binding is defined in a profile? If so, it should go in a new wrapper around TextInput
  // e.g. US Core Patient Profile

  function setValueWrapper(newValue: Address): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  function setUse(use: 'home' | 'work' | 'temp' | 'old' | 'billing'): void {
    setValueWrapper({ ...valueRef.current, use });
  }

  function setType(type: 'postal' | 'physical' | 'both'): void {
    setValueWrapper({ ...valueRef.current, type });
  }

  function setLine1(line1: string): void {
    setValueWrapper(setLine(valueRef.current || {}, 0, line1));
  }

  function setLine2(line2: string): void {
    setValueWrapper(setLine(valueRef.current || {}, 1, line2));
  }

  function setCity(city: string): void {
    setValueWrapper({ ...valueRef.current, city });
  }

  function setState(state: string): void {
    setValueWrapper({ ...valueRef.current, state });
  }

  function setPostalCode(postalCode: string): void {
    setValueWrapper({ ...valueRef.current, postalCode });
  }

  return (
    <Group gap="xs" wrap="nowrap" grow>
      <NativeSelect
        disabled={props.disabled || useProps?.readonly}
        data-testid="address-use"
        defaultValue={value.use}
        onChange={(e) => setUse(e.currentTarget.value as 'home' | 'work' | 'temp' | 'old' | 'billing')}
        data={['', 'home', 'work', 'temp', 'old', 'billing']}
      />
      <NativeSelect
        disabled={props.disabled || typeProps?.readonly}
        data-testid="address-type"
        defaultValue={value.type}
        onChange={(e) => setType(e.currentTarget.value as 'postal' | 'physical' | 'both')}
        data={['', 'postal', 'physical', 'both']}
      />
      <TextInput
        disabled={props.disabled || line1Props?.readonly}
        placeholder="Line 1"
        defaultValue={getLine(value, 0)}
        onChange={(e) => setLine1(e.currentTarget.value)}
      />
      <TextInput
        disabled={props.disabled || line2Props?.readonly}
        placeholder="Line 2"
        defaultValue={getLine(value, 1)}
        onChange={(e) => setLine2(e.currentTarget.value)}
      />
      <TextInput
        disabled={props.disabled || cityProps?.readonly}
        placeholder="City"
        defaultValue={value.city}
        onChange={(e) => setCity(e.currentTarget.value)}
      />
      <TextInput
        disabled={props.disabled || stateProps?.readonly}
        placeholder="State"
        defaultValue={value.state}
        onChange={(e) => setState(e.currentTarget.value)}
      />
      <TextInput
        disabled={props.disabled || postalCodeProps?.readonly}
        placeholder="Postal Code"
        defaultValue={value.postalCode}
        onChange={(e) => setPostalCode(e.currentTarget.value)}
      />
    </Group>
  );
}
