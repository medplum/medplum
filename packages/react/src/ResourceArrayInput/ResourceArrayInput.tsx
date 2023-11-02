import { ActionIcon } from '@mantine/core';
import { IconCircleMinus, IconCirclePlus } from '@tabler/icons-react';
import React, { useRef, useState } from 'react';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { killEvent } from '../utils/dom';
import { InternalSchemaElement } from '@medplum/core';

interface ResourceArrayInputProps {
  property: InternalSchemaElement;
  name: string;
  defaultValue?: any[];
  arrayElement?: boolean;
  onChange?: (value: any[]) => void;
}

export function ResourceArrayInput(props: ResourceArrayInputProps): JSX.Element {
  const [values, setValues] = useState(
    props.defaultValue && Array.isArray(props.defaultValue) ? props.defaultValue : []
  );

  const valuesRef = useRef<any[]>();
  valuesRef.current = values;

  function setValuesWrapper(newValues: any[]): void {
    setValues(newValues);
    if (props.onChange) {
      props.onChange(newValues);
    }
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <colgroup>
        <col width="97%" />
        <col width="3%" />
      </colgroup>
      <tbody>
        {values.map((v, index) => (
          <tr key={`${index}-${values.length}`}>
            <td>
              <ResourcePropertyInput
                arrayElement={true}
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
            <td style={{ textAlign: 'right' }}>
              <ActionIcon
                title="Remove"
                size="sm"
                onClick={(e: React.MouseEvent) => {
                  killEvent(e);
                  const copy = [...(valuesRef.current as any[])];
                  copy.splice(index, 1);
                  setValuesWrapper(copy);
                }}
              >
                <IconCircleMinus />
              </ActionIcon>
            </td>
          </tr>
        ))}
        <tr>
          <td></td>
          <td style={{ textAlign: 'right' }}>
            <ActionIcon
              title="Add"
              size="sm"
              color="green"
              onClick={(e: React.MouseEvent) => {
                killEvent(e);
                const copy = [...(valuesRef.current as any[])];
                copy.push(undefined);
                setValuesWrapper(copy);
              }}
            >
              <IconCirclePlus />
            </ActionIcon>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
