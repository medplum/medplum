import { Identifier } from '@medplum/core';
import React, { useState } from 'react';
import { TextField } from './TextField';

export interface IdentifierInputProps {
  name: string;
  value?: Identifier;
}

export function IdentifierInput(props: IdentifierInputProps) {
  const [value, setValue] = useState(props.value);
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={props.name} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <TextField
              value={value?.system}
              onChange={e => setValue({
                ...value,
                system: (e.currentTarget as HTMLInputElement).value
              })}
            />
          </td>
          <td>
            <TextField
              value={value?.value}
              onChange={e => setValue({
                ...value,
                value: (e.currentTarget as HTMLInputElement).value
              })}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
