import { PatientLink } from '@medplum/core';
import React, { useState } from 'react';

export interface PatientLinkInputProps {
  name: string;
  value?: PatientLink;
}

export function PatientLinkInput(props: PatientLinkInputProps) {
  const [value, setValue] = useState(props.value);
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={props.name} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <input type="text" defaultValue={value?.type} />
          </td>
          <td>
            <input type="text" defaultValue={JSON.stringify(value?.other)} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
