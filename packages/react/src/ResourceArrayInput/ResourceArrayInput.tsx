import { ActionIcon, Group, Stack } from '@mantine/core';
import { InternalSchemaElement, SliceDefinition } from '@medplum/core';
import { IconCircleMinus, IconCirclePlus } from '@tabler/icons-react';
import { MouseEvent, useRef, useState, useMemo } from 'react';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { killEvent } from '../utils/dom';
import { ResourceSliceInput } from '../ResourceSliceInput/ResourceSliceInput';
import { SliceInput } from '../SliceInput/SliceInput';

export interface ResourceArrayInputProps {
  property: InternalSchemaElement;
  name: string;
  defaultValue?: any[];
  arrayElement?: boolean;
  onChange?: (value: any[]) => void;
}

// TODO{mattlong} remove disable
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getSliceValue(arrayValues: any[] | undefined, slice: SliceDefinition): any[] {
  // temp: just return a single undefined representing an empty entry to be displayed
  return [undefined];
}

export function ResourceArrayInput(props: ResourceArrayInputProps): JSX.Element {
  const { property } = props;

  // TODO{mattlong} remove need of unhandledSlices
  const [slices, unhandledSlices] = useMemo<[SliceDefinition[], SliceDefinition[]]>(() => {
    if (!property.slicing) {
      return [[], []];
    }

    const results = [];
    const unhandled = [];
    for (const slice of property.slicing.slices) {
      if (!slice.type) {
        console.log('PANIC slice.type is missing');
        unhandled.push(slice);
        continue;
      } else if (slice.type.length > 1) {
        console.log('PANIC slice.type has more than one item');
        unhandled.push(slice);
        continue;
      }

      const sliceType = slice.type[0];
      if (sliceType.code !== 'Extension') {
        console.log('PANIC slice.type[0].code is not Extension', sliceType.code);
        unhandled.push(slice);
        continue;
      }

      results.push(slice);
    }
    return [results, unhandled];
  }, [property.slicing]);

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

  if (slices?.length > 0) {
    return (
      <Stack style={{ marginTop: '1rem', marginLeft: '1rem' }}>
        {slices.map((slice) => {
          return (
            <SliceInput
              slice={slice}
              key={slice.name}
              property={property}
              defaultValue={getSliceValue(props.defaultValue, slice)}
              onChange={(newValue: any[]) => {
                console.log('SliceInput.onChange', newValue);
              }}
            />
          );
        })}
        {unhandledSlices.map((slice) => (
          <Group key={slice.name} noWrap>
            Unhandled slice: {slice.name}
          </Group>
        ))}
      </Stack>
    );
  }

  return (
    <Stack style={{ marginTop: '1rem', marginLeft: '1rem' }}>
      {values.map((v, index) => (
        <Group key={`${index}-${values.length}`} noWrap style={{ flexGrow: 1 }}>
          <div style={{ flexGrow: 1 }}>
            {v?.sliceName ? (
              <ResourceSliceInput
                property={props.property}
                name={props.name}
                sliceName={v.sliceName}
                profileUrl={v.url}
                defaultValue={v}
                onChange={(newValue: any) => {
                  const copy = [...(valuesRef.current as any[])];
                  copy[index] = newValue;
                  setValuesWrapper(copy);
                }}
              />
            ) : (
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
            )}
          </div>
          <div>
            <ActionIcon
              title="Remove"
              size="sm"
              onClick={(e: MouseEvent) => {
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
            onClick={(e: MouseEvent) => {
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
