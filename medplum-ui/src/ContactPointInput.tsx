import React, { useState } from 'react';
import { PropertyDefinition } from 'medplum';

export interface ContactPointInputProps {
  propertyPrefix: string;
  property: PropertyDefinition;
  value?: any;
}

export function ContactPointInput(props: ContactPointInputProps) {
  const [value, setValue] = useState(props.value);
  const inputName = props.propertyPrefix + props.property.key;
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={inputName} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <select defaultValue={value.system}>
              <option></option>
              <option>email</option>
              <option>fax</option>
              <option>pager</option>
              <option>phone</option>
              <option>other</option>
              <option>sms</option>
              <option>sms</option>
            </select>
          </td>
          <td>
            <select defaultValue={value.use}>
              <option></option>
              <option>home</option>
              <option>mobile</option>
              <option>old</option>
              <option>temp</option>
              <option>work</option>
            </select>
          </td>
          <td>
            <input type="text" defaultValue={value.value} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
