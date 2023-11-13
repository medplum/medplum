import { ActionIcon, Group, Stack } from '@mantine/core';
import { InternalSchemaElement } from '@medplum/core';
import { IconCircleMinus, IconCirclePlus } from '@tabler/icons-react';
import React, { useRef, useState } from 'react';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { killEvent } from '../utils/dom';

export interface ResourceArrayInputProps {
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
    <Stack style={{ marginTop: '1rem', marginLeft: '1rem' }}>
      {values.map((v, index) => (
        <Group key={`${index}-${values.length}`} noWrap>
          <div style={{ flexGrow: 1 }}>
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
          </div>
          <div>
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
          </div>
        </Group>
      ))}
      <Group noWrap style={{ justifyContent: 'flex-end' }}>
        <div>
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
        </div>
      </Group>
    </Stack>
  );
}
