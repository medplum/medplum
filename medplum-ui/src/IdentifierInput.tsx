import React, { useState } from 'react';
import { PropertyDefinition } from 'medplum';

export interface IdentifierInputProps {
  propertyPrefix: string;
  property: PropertyDefinition;
  value?: any;
}

export function IdentifierInput(props: IdentifierInputProps) {
  const [value, setValue] = useState(props.value);
  const inputName = props.propertyPrefix + props.property.key;
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={inputName} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <input type="text" defaultValue={value.system} />
          </td>
          <td>
            <input type="text" defaultValue={value.value} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
