import React, { useState } from 'react';
import { PropertyDefinition } from 'medplum';

export interface DeviceNameInputProps {
  propertyPrefix: string;
  property: PropertyDefinition;
  value?: any;
}

export function DeviceNameInput(props: DeviceNameInputProps) {
  const [value, setValue] = useState(props.value);
  const inputName = props.propertyPrefix + props.property.key;
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={inputName} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <select defaultValue={value.type}>
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
            <input type="text" defaultValue={value.name} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
