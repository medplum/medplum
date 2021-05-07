import React, { useState } from 'react';
import { PropertyDefinition } from 'medplum';

export interface ReferenceInputProps {
  propertyPrefix: string;
  property: PropertyDefinition;
  value?: any;
}

export function ReferenceInput(props: ReferenceInputProps) {
  const [value, setValue] = useState(props.value || {});
  const inputName = props.propertyPrefix + props.property.key;
  const [resourceType, id] = (value.reference || '/').split('/');
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={inputName} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <input type="text" defaultValue={resourceType} />
          </td>
          <td>
            <input type="text" defaultValue={id} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
