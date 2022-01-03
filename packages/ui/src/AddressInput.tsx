import { Address } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { InputRow } from './InputRow';

function getLine(address: Address, index: number): string {
  return address && address.line && address.line.length > index ? address.line[index] : '';
}

function setLine(address: Address, index: number, str: string): Address {
  const line: string[] = address.line || [];
  while (line.length <= index) {
    line.push('');
  }
  line[index] = str;
  return { ...address, line };
}

export interface AddressInputProps {
  name: string;
  defaultValue?: Address;
  onChange?: (value: Address) => void;
}

export function AddressInput(props: AddressInputProps): JSX.Element {
  const [value, setValue] = useState<Address>(props.defaultValue || {});

  const valueRef = useRef<Address>();
  valueRef.current = value;

  function setValueWrapper(newValue: Address): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  function setUse(use: string): void {
    setValueWrapper({ ...valueRef.current, use });
  }

  function setType(type: string): void {
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
    <InputRow>
      <select data-testid="address-use" defaultValue={value?.use} onChange={(e) => setUse(e.currentTarget.value)}>
        <option></option>
        <option>home</option>
        <option>mobile</option>
        <option>old</option>
        <option>temp</option>
        <option>work</option>
      </select>
      <select data-testid="address-type" defaultValue={value?.type} onChange={(e) => setType(e.currentTarget.value)}>
        <option></option>
        <option>postal</option>
        <option>physical</option>
        <option>both</option>
      </select>
      <input
        type="text"
        placeholder="Line 1"
        defaultValue={getLine(value, 0)}
        onChange={(e) => setLine1(e.currentTarget.value)}
      />
      <input
        type="text"
        placeholder="Line 2"
        defaultValue={getLine(value, 1)}
        onChange={(e) => setLine2(e.currentTarget.value)}
      />
      <input
        type="text"
        placeholder="City"
        defaultValue={value.city}
        onChange={(e) => setCity(e.currentTarget.value)}
      />
      <input
        type="text"
        placeholder="State"
        defaultValue={value.state}
        onChange={(e) => setState(e.currentTarget.value)}
      />
      <input
        type="text"
        placeholder="Postal Code"
        defaultValue={value.postalCode}
        onChange={(e) => setPostalCode(e.currentTarget.value)}
      />
    </InputRow>
  );
}
