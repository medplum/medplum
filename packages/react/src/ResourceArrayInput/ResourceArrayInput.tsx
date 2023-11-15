import { ActionIcon, Group, Stack } from '@mantine/core';
import { InternalSchemaElement, isEmpty } from '@medplum/core';
import { IconCircleMinus, IconCirclePlus } from '@tabler/icons-react';
import { MouseEvent, useRef, useState, useMemo } from 'react';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { killEvent } from '../utils/dom';
import { ResourceSliceInput } from '../ResourceSliceInput/ResourceSliceInput';

export interface ResourceArrayInputProps {
  property: InternalSchemaElement;
  name: string;
  defaultValue?: any[];
  arrayElement?: boolean;
  onChange?: (value: any[]) => void;
}

export function ResourceArrayInput(props: ResourceArrayInputProps): JSX.Element {
  const { property } = props;

  const [_slices, _unhandledSlices] = useMemo(() => {
    if (!property.slicing) {
      return [];
    }

    const results = [];
    const unhandled = [];
    for (const slice of property.slicing.slices) {
      const sliceName = slice.name;

      if (!isEmpty(slice.elements)) {
        console.log('WARN slice.elements is NOT empty', slice);
      }

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

      if (!sliceType.profile) {
        console.log('PANIC slice.type[0].profile is missing', sliceType);
        unhandled.push(slice);
        continue;
      } else if (sliceType.profile.length > 1) {
        console.log('PANIC slice.type[0].profile has more than one item');
        unhandled.push(slice);
        continue;
      }

      const sliceTypeProfileUrl = sliceType.profile[0];
      console.debug({ sliceName, profileUrl: sliceTypeProfileUrl });

      results.push(slice);
    }
    return [results, unhandled];
  }, [property.slicing]);

  const [values, setValues] = useState(() => {
    const defaultValueArray = props.defaultValue && Array.isArray(props.defaultValue) ? props.defaultValue : [];
    if (property.slicing) {
      console.debug({ slicing: property.slicing });
      const defaultValues = [];
      for (const slice of property.slicing.slices) {
        const sliceName = slice.name;

        if (!isEmpty(slice.elements)) {
          console.log('WARN slice.elements is NOT empty', slice);
        }

        if (!slice.type) {
          console.log('WARN slice.type is missing');
          continue;
        } else if (slice.type.length > 1) {
          console.log('WARN slice.type has more than one item');
          continue;
        }

        const sliceType = slice.type[0];
        if (sliceType.code !== 'Extension') {
          console.log('WARN slice.type[0].code is not Extension', sliceType.code);
          continue;
        }

        if (!sliceType.profile) {
          console.log('WARN slice.type[0].profile is missing', sliceType);
          continue;
        } else if (sliceType.profile.length > 1) {
          console.log('WARN slice.type[0].profile has more than one item');
          continue;
        }

        const sliceTypeProfileUrl = sliceType.profile[0];

        console.debug({ sliceName, profileUrl: sliceTypeProfileUrl });
        const existingValues = defaultValueArray.filter((v) => v.url === sliceTypeProfileUrl);
        const finalValues = [...existingValues];
        if (finalValues.length > slice.max) {
          console.log(`Too many existing values for slice ${sliceName}`, existingValues);
          continue;
        }

        const placeholdersToShow = 1;

        for (let i = 0; i < placeholdersToShow - finalValues.length; i++) {
          finalValues.push({
            __placeholder: true,
            sliceName,
            url: sliceTypeProfileUrl,
          });
        }
        for (const val of finalValues) {
          defaultValues.push({ ...val });
        }
      }
      return defaultValues;
    } else {
      return defaultValueArray;
    }
  });

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
