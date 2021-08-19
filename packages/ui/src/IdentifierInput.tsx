import { Identifier, stringify } from '@medplum/core';
import React, { useState } from 'react';
import { TextField } from './TextField';

export interface IdentifierInputProps {
  name: string;
  defaultValue?: Identifier;
}

export function IdentifierInput(props: IdentifierInputProps) {
  const [value, setValue] = useState(props.defaultValue);
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={props.name} type="hidden" value={stringify(value)} readOnly={true} />
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
