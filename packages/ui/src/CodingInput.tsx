import { Coding } from '@medplum/core';
import React, { useState } from 'react';

export interface CodingInputProps {
  name: string;
  value?: Coding;
}

export function CodingInput(props: CodingInputProps) {
  const [value, setValue] = useState<Coding>(props.value ?? {});
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={props.name} type="hidden" value={JSON.stringify(value)} readOnly={true} />
            <input
              type="text"
              defaultValue={value.system}
              onChange={e => setValue({ ...value, system: e.target.value })}
            />
          </td>
          <td>
            <input
              type="text"
              defaultValue={value.code}
              onChange={e => setValue({ ...value, code: e.target.value })}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
