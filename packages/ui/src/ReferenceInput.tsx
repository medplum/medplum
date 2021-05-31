import { Reference } from '@medplum/core';
import React, { useRef, useState } from 'react';

export interface ReferenceInputProps {
  name: string;
  value?: Reference;
}

export function ReferenceInput(props: ReferenceInputProps) {
  const [value, setValue] = useState<Reference | undefined>(props.value);

  const valueRef = useRef<Reference>();
  valueRef.current = value;

  const [resourceType, id] = (value?.reference || '/').split('/');

  function setResourceType(resourceType: string) {
    setValue({ ...valueRef.current, reference: resourceType + '/' + id });
  }

  function setId(id: string) {
    setValue({ ...valueRef.current, reference: resourceType + '/' + id });
  }

  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input name={props.name} type="hidden" value={JSON.stringify(value) || ''} readOnly={true} />
            <input
              type="text"
              defaultValue={resourceType}
              onChange={e => setResourceType(e.currentTarget.value)}
            />
          </td>
          <td>
            <input
              type="text"
              defaultValue={id}
              onChange={e => setId(e.currentTarget.value)}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
