import React, { useState } from 'react';
import { PropertyDefinition } from 'medplum';

export interface HumanNameInputProps {
  propertyPrefix: string;
  property: PropertyDefinition;
  value?: any;
}

export function HumanNameInput(props: HumanNameInputProps) {
  const [value, setValue] = useState(props.value);
  const inputName = props.propertyPrefix + props.property.key;
  const use = value.use;
  const prefix = value.prefix;
  const given = !value || !value.given ? '' : value.given.join(' ');
  const family = value.family;
  const suffix = value.suffix;
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={inputName} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <select defaultValue={value.use}>
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
            <input type="text" defaultValue={prefix} />
          </td>
          <td>
            <input type="text" defaultValue={given} />
          </td>
          <td>
            <input type="text" defaultValue={family} />
          </td>
          <td>
            <input type="text" defaultValue={suffix} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
