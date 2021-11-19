import { ElementDefinition, IndexedStructureDefinition } from '@medplum/core';
import React, { useRef, useState } from 'react';
import { Button } from './Button';
import { ResourcePropertyInput } from './ResourcePropertyInput';
import { killEvent } from './utils/dom';

interface ResourceArrayInputProps {
  schema: IndexedStructureDefinition;
  property: ElementDefinition;
  name: string;
  defaultValue?: any[];
  arrayElement?: boolean;
  onChange?: (value: any[]) => void;
}

export function ResourceArrayInput(props: ResourceArrayInputProps) {
  const [values, setValues] = useState(props.defaultValue ?? []);

  const valuesRef = useRef<any[]>();
  valuesRef.current = values;

  function setValuesWrapper(newValues: any[]): void {
    setValues(newValues);
    if (props.onChange) {
      props.onChange(newValues);
    }
  }

  return (
    <div>
      <table>
        <colgroup>
          <col width="90%" />
          <col width="10%" />
        </colgroup>
        <tbody>
          {values.map((v, index) => (
            <tr key={`${index}-${values.length}`}>
              <td>
                <ResourcePropertyInput
                  arrayElement={true}
                  schema={props.schema}
                  property={props.property}
                  name={props.name + '.' + index}
                  defaultValue={v}
                  onChange={(newValue: any) => {
                    const copy = [...(valuesRef.current as any[])];
                    copy[index] = newValue;
                    setValuesWrapper(copy);
                  }}
                />
              </td>
              <td>
                <Button
                  onClick={e => {
                    killEvent(e);
                    const copy = [...(valuesRef.current as any[])];
                    copy.splice(index, 1);
                    setValuesWrapper(copy);
                  }}>Remove</Button>
              </td>
            </tr>
          ))}
          <tr>
            <td></td>
            <td>
              <Button
                onClick={e => {
                  killEvent(e);
                  const copy = [...(valuesRef.current as any[])];
                  copy.push(undefined);
                  setValuesWrapper(copy);
                }}>Add</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
