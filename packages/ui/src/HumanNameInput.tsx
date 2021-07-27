import { HumanName } from '@medplum/core';
import React, { useRef, useState } from 'react';

export interface HumanNameInputProps {
  name: string;
  value?: HumanName;
}

export function HumanNameInput(props: HumanNameInputProps) {
  const [value, setValue] = useState<HumanName | undefined>(props.value);

  const valueRef = useRef<HumanName>();
  valueRef.current = value;

  function setUse(use: string) {
    setValue({ ...valueRef.current, use: use ? use : undefined });
  }

  function setPrefix(prefix: string) {
    setValue({ ...valueRef.current, prefix: prefix ? prefix.split(' ') : undefined });
  }

  function setGiven(given: string) {
    setValue({ ...valueRef.current, given: given ? given.split(' ') : undefined });
  }

  function setFamily(family: string) {
    setValue({ ...valueRef.current, family: family ? family : undefined });
  }

  function setSuffix(suffix: string) {
    setValue({ ...valueRef.current, suffix: suffix ? suffix.split(' ') : undefined });
  }

  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input
              name={props.name}
              type="hidden"
              value={JSON.stringify(value)}
              readOnly={true}
              data-testid="hidden"
            />
            <select
              defaultValue={value?.use}
              onChange={e => setUse(e.currentTarget.value)}
              data-testid="use"
            >
              <option></option>
              <option>usual</option>
              <option>official</option>
              <option>temp</option>
              <option>nickname</option>
              <option>anonymous</option>
              <option>old</option>
              <option>maiden</option>
            </select>
          </td>
          <td>
            <input
              type="text"
              defaultValue={value?.prefix?.join(' ')}
              onChange={e => setPrefix(e.currentTarget.value)}
              data-testid="prefix"
            />
          </td>
          <td>
            <input
              type="text"
              defaultValue={value?.given?.join(' ')}
              onChange={e => setGiven(e.currentTarget.value)}
              data-testid="given"
            />
          </td>
          <td>
            <input
              type="text"
              defaultValue={value?.family}
              onChange={e => setFamily(e.currentTarget.value)}
              data-testid="family"
            />
          </td>
          <td>
            <input
              type="text"
              defaultValue={value?.suffix?.join(' ')}
              onChange={e => setSuffix(e.currentTarget.value)}
              data-testid="suffix"
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
