import { Identifier } from '@medplum/core';
import React, { useState } from 'react';
import { TextField } from './TextField';

export interface IdentifierInputProps {
  name: string;
  defaultValue?: Identifier;
  onChange?: (value: Identifier) => void;
}

export function IdentifierInput(props: IdentifierInputProps) {
  const [value, setValue] = useState(props.defaultValue);

  function setValueWrapper(newValue: Identifier): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <table>
      <tbody>
        <tr>
          <td>
            <TextField
              placeholder="System"
              defaultValue={value?.system}
              onChange={e => setValueWrapper({
                ...value,
                system: (e.currentTarget as HTMLInputElement).value
              })}
            />
          </td>
          <td>
            <TextField
              placeholder="Value"
              defaultValue={value?.value}
              onChange={e => setValueWrapper({
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
