import { ActionIcon, Group, Stack } from '@mantine/core';
import {
  InternalSchemaElement,
  SliceDefinition,
  SlicingRules,
  arrayify,
  getNestedProperty,
  matchDiscriminant,
} from '@medplum/core';
import { IconCircleMinus, IconCirclePlus } from '@tabler/icons-react';
import { MouseEvent, useState, useMemo } from 'react';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { killEvent } from '../utils/dom';
import { SliceInput } from '../SliceInput/SliceInput';
import { OperationOutcome } from '@medplum/fhirtypes';

export interface ResourceArrayInputProps {
  property: InternalSchemaElement;
  name: string;
  defaultValue?: any[];
  indent?: boolean;
  arrayElement?: boolean;
  outcome?: OperationOutcome;
  onChange?: (value: any[]) => void;
}

// TODO{mattlong} getValueSliceName is broken. To reuse the validation discriminator
// handling requires TypedValues and some related helper functions that look for type schemas
// which doesn't work very well with slices yet
function getValueSliceName(value: any, slicingRules: SlicingRules): string | undefined {
  // based on packages/core/src/typeschema/validation.ts#checkSliceElement
  for (const slice of slicingRules.slices) {
    if (
      slicingRules.discriminator.every((discriminator) => {
        return arrayify(getNestedProperty(value, discriminator.path))?.some((v) =>
          matchDiscriminant(v, discriminator, slice)
        );
      })
    ) {
      return slice.name;
    }
  }
  return undefined;
}

// TODO{mattlong} assignValuesIntoSlices is broken. It results in existing values NOT
// being displayed at all and instead always returns a single entry for each slice right now
function assignValuesIntoSlices(values: any[], slicing: SlicingRules | undefined): any[][] {
  if (!slicing || slicing.slices.length === 0) {
    return [values];
  }

  console.debug({ slicing, values });
  const slices = slicing.slices;
  const slicedValues: any[][] = new Array(slices.length + 1);
  for (let i = 0; i < slicedValues.length; i++) {
    slicedValues[i] = [];
  }

  // TODO{mattlong} placeholder bit to return a single, empty value for each slice
  for (let i = 0; i < slices.length; i++) {
    slicedValues[i].push(undefined);
  }

  for (const value of values) {
    const sliceName = getValueSliceName(value, slicing);
    let sliceIndex = slices.findIndex((slice) => slice.name === sliceName);
    console.debug(`sliceName: ${sliceName} index: ${sliceIndex}`, value);
    if (sliceIndex === -1) {
      sliceIndex = slices.length;
    }
    slicedValues[sliceIndex].push(value);
  }
  return slicedValues;
}

export function ResourceArrayInput(props: ResourceArrayInputProps): JSX.Element {
  const { property } = props;

  // TODO{mattlong} remove need of unhandledSlices
  const [slices, _unhandledSlices] = useMemo<[SliceDefinition[], SliceDefinition[]]>(() => {
    if (!property.slicing) {
      return [[], []];
    }

    const results = [];
    const unhandled = [];
    for (const slice of property.slicing.slices) {
      if (!slice.type) {
        console.warn('PANIC slice.type is missing');
        unhandled.push(slice);
        continue;
      } else if (slice.type.length > 1) {
        //TODO{mattlong} Can a slice have more than one type?
        console.warn('PANIC slice has more than one type');
        unhandled.push(slice);
        continue;
      }
      const sliceType = slice.type[0];

      if (sliceType.code !== 'Extension') {
        console.warn('PANIC slice.type[0].code is not Extension', sliceType.code);
        unhandled.push(slice);
        continue;
      }

      results.push(slice);
    }
    return [results, unhandled];
  }, [property.slicing]);

  const [sliceValues, setSliceValues] = useState(() =>
    assignValuesIntoSlices(props.defaultValue ?? [], property.slicing)
  );

  function setValuesWrapper(newValues: any[], sliceIndex: number): void {
    const newSliceValues = [...sliceValues];
    newSliceValues[sliceIndex] = newValues;
    setSliceValues(newSliceValues);
    if (props.onChange) {
      // Remove any placeholder (i.e. undefined) values before propagating up the chain
      console.debug('ResourceArrayInput', JSON.stringify(newSliceValues.flat().filter(Boolean)));
      props.onChange(newSliceValues.flat().filter((val) => val !== undefined));
    }
  }

  const style = props.indent ? { marginTop: '1rem', marginLeft: '1rem' } : undefined;
  const nonSliceIndex = slices.length;
  const nonSliceValues = sliceValues[nonSliceIndex];

  const enableRemoveNonSliceValues = property.type[0].code === 'Extension';
  return (
    <Stack style={style}>
      {slices.map((slice, sliceIndex) => {
        return (
          <SliceInput
            slice={slice}
            key={slice.name}
            property={property}
            defaultValue={sliceValues[sliceIndex]}
            onChange={(newValue: any[]) => {
              setValuesWrapper(newValue, sliceIndex);
            }}
          />
        );
      })}

      {nonSliceValues.map((value, valueIndex) => (
        <Group key={`${valueIndex}-${nonSliceValues.length}`} noWrap style={{ flexGrow: 1 }}>
          <div style={{ flexGrow: 1 }}>
            <ResourcePropertyInput
              arrayElement={true}
              property={props.property}
              name={props.name + '.' + valueIndex}
              defaultValue={value}
              onChange={(newValue: any) => {
                const newNonSliceValues = [...nonSliceValues];
                newNonSliceValues[valueIndex] = newValue;
                setValuesWrapper(newNonSliceValues, nonSliceIndex);
              }}
              defaultPropertyType={undefined}
              outcome={props.outcome}
            />
          </div>
          <div>
            <ActionIcon
              title="Remove"
              size="sm"
              onClick={(e: MouseEvent) => {
                killEvent(e);
                const newNonSliceValues = [...nonSliceValues];
                newNonSliceValues.splice(valueIndex, 1);
                setValuesWrapper(newNonSliceValues, nonSliceIndex);
              }}
            >
              <IconCircleMinus />
            </ActionIcon>
          </div>
        </Group>
      ))}
      {enableRemoveNonSliceValues && (
        <Group noWrap style={{ justifyContent: 'flex-end' }}>
          <div>
            <ActionIcon
              title="Add"
              size="sm"
              color="green"
              onClick={(e: MouseEvent) => {
                killEvent(e);
                const newNonSliceValues = [...nonSliceValues];
                newNonSliceValues.push(undefined);
                setValuesWrapper(newNonSliceValues, nonSliceIndex);
              }}
            >
              <IconCirclePlus />
            </ActionIcon>
          </div>
        </Group>
      )}
    </Stack>
  );
}
