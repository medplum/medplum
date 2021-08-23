import { CodeableConcept } from '@medplum/core';
import React, { useState } from 'react';

function getCoding(codeableConcept: any) {
  if (!codeableConcept || !codeableConcept.coding || codeableConcept.coding.length === 0) {
    return {};
  }
  return codeableConcept.coding[0];
}

export interface CodeableConceptInputProps {
  name: string;
  defaultValue?: CodeableConcept;
}

export function CodeableConceptInput(props: CodeableConceptInputProps) {
  const [value, setValue] = useState(props.defaultValue);
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={props.name} type="hidden" value={JSON.stringify(value)} readOnly={true} />
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
