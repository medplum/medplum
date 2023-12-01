import { Group, NativeSelect, TextInput } from '@mantine/core';
import { Address } from '@medplum/fhirtypes';
import { useContext, useMemo, useRef, useState } from 'react';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { BackboneElementContext } from '../BackboneElementInput/BackbonElementInput.utils';

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

type AddressInputProps = ComplexTypeInputProps<Address>;

export function AddressInput(props: AddressInputProps): JSX.Element {
  const [value, setValue] = useState<Address>(props.defaultValue || {});
  const { getNestedElement } = useContext(BackboneElementContext);

  const valueRef = useRef<Address>();
  valueRef.current = value;

  const _stateElement = useMemo(() => getNestedElement(props.property, 'state'), [getNestedElement, props.property]);
  if (_stateElement?.binding) {
    console.log('address.state has a binding not being shown', _stateElement.binding);
  }

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
    <Group spacing="xs" grow noWrap>
      <NativeSelect
        data-testid="address-use"
        defaultValue={value.use}
        onChange={(e) => setUse(e.currentTarget.value as 'home' | 'work' | 'temp' | 'old' | 'billing')}
        data={['', 'home', 'work', 'temp', 'old', 'billing']}
      />
      <NativeSelect
        data-testid="address-type"
        defaultValue={value.type}
        onChange={(e) => setType(e.currentTarget.value as 'postal' | 'physical' | 'both')}
        data={['', 'postal', 'physical', 'both']}
      />
      <TextInput
        placeholder="Line 1"
        defaultValue={getLine(value, 0)}
        onChange={(e) => setLine1(e.currentTarget.value)}
      />
      <TextInput
        placeholder="Line 2"
        defaultValue={getLine(value, 1)}
        onChange={(e) => setLine2(e.currentTarget.value)}
      />
      <TextInput placeholder="City" defaultValue={value.city} onChange={(e) => setCity(e.currentTarget.value)} />
      <TextInput placeholder="State" defaultValue={value.state} onChange={(e) => setState(e.currentTarget.value)} />
      <TextInput
        placeholder="Postal Code"
        defaultValue={value.postalCode}
        onChange={(e) => setPostalCode(e.currentTarget.value)}
      />
    </Group>
  );
}
