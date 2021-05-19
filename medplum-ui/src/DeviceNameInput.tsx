import { DeviceDeviceName, PropertyDefinition } from 'medplum';
import React, { useState } from 'react';

export interface DeviceNameInputProps {
  property: PropertyDefinition;
  name: string;
  value?: DeviceDeviceName;
}

export function DeviceNameInput(props: DeviceNameInputProps) {
  const [value, setValue] = useState(props.value);
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={props.name} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <select defaultValue={value?.type}>
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
            <input type="text" defaultValue={value?.name} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
