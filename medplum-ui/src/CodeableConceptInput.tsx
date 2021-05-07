import React, { useState } from 'react';
import { PropertyDefinition } from 'medplum';

function getCoding(codeableConcept: any) {
  if (!codeableConcept || !codeableConcept.coding || codeableConcept.coding.length === 0) {
    return {};
  }
  return codeableConcept.coding[0];
}

export interface CodeableConceptInputProps {
  propertyPrefix?: string;
  property: PropertyDefinition;
  value?: any;
}

export function CodeableConceptInput(props: CodeableConceptInputProps) {
  const [value, setValue] = useState(props.value);
  const inputName = props.propertyPrefix + props.property.key;
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={inputName} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <input type="text" defaultValue={getCoding(value).system} />
          </td>
          <td>
            <input type="text" defaultValue={getCoding(value).code} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
