import React, { useState } from 'react';
import { PropertyDefinition } from 'medplum';

export interface PatientLinkInputProps {
  propertyPrefix: string;
  property: PropertyDefinition;
  value?: any;
}

export function PatientLinkInput(props: PatientLinkInputProps) {
  const [value, setValue] = useState(props.value);
  const inputName = props.propertyPrefix + props.property.key;
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={inputName} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <input type="text" defaultValue={value.type} />
          </td>
          <td>
            <input type="text" defaultValue={value.other} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
