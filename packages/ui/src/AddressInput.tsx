import { Address } from '@medplum/core';
import React, { useRef, useState } from 'react';

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
  value?: Address;
}

export function AddressInput(props: AddressInputProps) {
  const [value, setValue] = useState<Address>(props.value || {});

  const valueRef = useRef<Address>();
  valueRef.current = value;

  function setUse(use: string) {
    setValue({ ...valueRef.current, use });
  }

  function setType(type: string) {
    setValue({ ...valueRef.current, type });
  }

  function setLine1(line1: string) {
    setValue(setLine(valueRef.current || {}, 0, line1));
  }

  function setLine2(line2: string) {
    setValue(setLine(valueRef.current || {}, 1, line2));
  }

  function setCity(city: string) {
    setValue({ ...valueRef.current, city });
  }

  function setState(state: string) {
    setValue({ ...valueRef.current, state });
  }

  function setPostalCode(postalCode: string) {
    setValue({ ...valueRef.current, postalCode });
  }

  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={props.name} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <select defaultValue={value?.use} onChange={e => setUse(e.currentTarget.value)}>
              <option></option>
              <option>home</option>
              <option>mobile</option>
              <option>old</option>
              <option>temp</option>
              <option>work</option>
            </select>
          </td>
          <td>
            <select defaultValue={value?.type} onChange={e => setType(e.currentTarget.value)}>
              <option></option>
              <option>postal</option>
              <option>physical</option>
              <option>both</option>
            </select>
          </td>
          <td>
            <input type="text" defaultValue={getLine(value, 0)} onChange={e => setLine1(e.currentTarget.value)} />
          </td>
          <td>
            <input type="text" defaultValue={getLine(value, 1)} onChange={e => setLine2(e.currentTarget.value)} />
          </td>
          <td>
            <input type="text" defaultValue={value.city} onChange={e => setCity(e.currentTarget.value)} />
          </td>
          <td>
            <input type="text" defaultValue={value.state} onChange={e => setState(e.currentTarget.value)} />
          </td>
          <td>
            <input type="text" defaultValue={value.postalCode} onChange={e => setPostalCode(e.currentTarget.value)} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
