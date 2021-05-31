import { DeviceName } from '@medplum/core';
import React, { useRef, useState } from 'react';

export interface DeviceNameInputProps {
  name: string;
  value?: DeviceName;
}

export function DeviceNameInput(props: DeviceNameInputProps) {
  const [value, setValue] = useState(props.value);

  const valueRef = useRef<DeviceName>();
  valueRef.current = value;

  function setType(type: string) {
    setValue({ ...valueRef.current, type });
  }

  function setName(name: string) {
    setValue({ ...valueRef.current, name });
  }

  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={props.name} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <select defaultValue={value?.type} onChange={e => setType(e.currentTarget.value)}>
              <option></option>
              <option>udi-label-name</option>
              <option>user-friendly-name</option>
              <option>patient-reported-name</option>
              <option>manufacturer-name</option>
              <option>model-name</option>
              <option>other</option>
            </select>
          </td>
          <td>
            <input type="text" defaultValue={value?.name} onChange={e => setName(e.currentTarget.value)} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
