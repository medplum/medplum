import { ElementDefinition, IndexedStructureDefinition } from '@medplum/core';
import React, { useState } from 'react';
import { Button } from './Button';
import { ensureKeys, generateKey } from './FormUtils';
import { ResourcePropertyInput } from './ResourcePropertyInput';

interface ResourceArrayProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  name: string;
  defaultValue: any[];
  arrayElement?: boolean;
}

export function ResourceArrayInput(props: ResourceArrayProps) {
  const [values, setValues] = useState(ensureKeys(props.defaultValue));
  return (
    <div>
      {values.map(v => v.__removed && (
        <input key={v.__key} type="hidden" name={props.name + '.' + v.__key} value={JSON.stringify(v)} />
      ))}
      <table>
        <colgroup>
          <col width="90%" />
          <col width="10%" />
        </colgroup>
        <tbody>
          {values.map((v, index) => !v.__removed && (
            <tr key={v.__key}>
              <td>
                <ResourcePropertyInput
                  arrayElement={true}
                  schema={props.schema}
                  property={props.property}
                  name={props.name + '.' + v.__key}
                  defaultValue={v} />
              </td>
              <td>
                <Button
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const copy = values.slice();
                    copy[index].__removed = true;
                    setValues(copy);
                  }}>Remove</Button>
              </td>
            </tr>
          ))}
          <tr>
            <td></td>
            <td>
              <Button
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  const copy = values.slice();
                  copy.push({ __key: generateKey() });
                  setValues(copy);
                }}>Add</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
