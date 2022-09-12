import { Address } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { Input } from './Input';
import { InputRow } from './InputRow';
import { Select } from './Select';

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
    <InputRow>
      <Select testid="address-use" defaultValue={value?.use} onChange={setUse as (use: string) => void}>
        <option></option>
        <option>home</option>
        <option>mobile</option>
        <option>old</option>
        <option>temp</option>
        <option>work</option>
      </Select>
      <Select testid="address-type" defaultValue={value?.type} onChange={setType as (use: string) => void}>
        <option></option>
        <option>postal</option>
        <option>physical</option>
        <option>both</option>
      </Select>
      <Input placeholder="Line 1" defaultValue={getLine(value, 0)} onChange={setLine1} />
      <Input placeholder="Line 2" defaultValue={getLine(value, 1)} onChange={setLine2} />
      <Input placeholder="City" defaultValue={value.city} onChange={setCity} />
      <Input placeholder="State" defaultValue={value.state} onChange={setState} />
      <Input placeholder="Postal Code" defaultValue={value.postalCode} onChange={setPostalCode} />
    </InputRow>
  );
}
