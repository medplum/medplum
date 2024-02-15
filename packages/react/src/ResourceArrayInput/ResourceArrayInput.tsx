import { Group, Stack } from '@mantine/core';
import { InternalSchemaElement, SliceDefinitionWithTypes, getPathDisplayName } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { MouseEvent, useContext, useEffect, useState } from 'react';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { SliceInput } from '../SliceInput/SliceInput';
import { ArrayAddButton } from '../buttons/ArrayAddButton';
import { ArrayRemoveButton } from '../buttons/ArrayRemoveButton';
import { killEvent } from '../utils/dom';
import classes from './ResourceArrayInput.module.css';
import { assignValuesIntoSlices, prepareSlices } from './ResourceArrayInput.utils';

export interface ResourceArrayInputProps {
  readonly property: InternalSchemaElement;
  readonly name: string;
  readonly path: string;
  readonly defaultValue?: any[];
  readonly indent?: boolean;
  readonly outcome: OperationOutcome | undefined;
  readonly onChange?: (value: any[]) => void;
  readonly hideNonSliceValues?: boolean;
}

export function ResourceArrayInput(props: ResourceArrayInputProps): JSX.Element {
  const { property } = props;
  const medplum = useMedplum();
  const [loading, setLoading] = useState(true);
  const [slices, setSlices] = useState<SliceDefinitionWithTypes[]>([]);
  // props.defaultValue should NOT be used after this; prefer the defaultValue state
  const [defaultValue] = useState<any[]>(() => (Array.isArray(props.defaultValue) ? props.defaultValue : []));
  const [slicedValues, setSlicedValues] = useState<any[][]>(() => [defaultValue]);
  const ctx = useContext(ElementsContext);

  const propertyTypeCode = property.type[0]?.code;
  useEffect(() => {
    prepareSlices({
      medplum,
      property,
    })
      .then((slices) => {
        setSlices(slices);
        const slicedValues = assignValuesIntoSlices(defaultValue, slices, property.slicing, ctx.profileUrl);
        setSlicedValues(slicedValues);
        setLoading(false);
      })
      .catch((reason) => {
        console.error(reason);
        setLoading(false);
      });
  }, [medplum, property, defaultValue, ctx.profileUrl, setSlicedValues, props.path]);

  function setValuesWrapper(newValues: any[], sliceIndex: number): void {
    const newSlicedValues = [...slicedValues];
    newSlicedValues[sliceIndex] = newValues;
    setSlicedValues(newSlicedValues);
    if (props.onChange) {
      // Remove any placeholder (i.e. undefined) values before propagating
      const cleaned = newSlicedValues.flat().filter((val) => val !== undefined);
      props.onChange(cleaned);
    }
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  const nonSliceIndex = slices.length;
  const nonSliceValues = slicedValues[nonSliceIndex];

  // Hide non-sliced values when handling sliced extensions
  const showNonSliceValues = !(props.hideNonSliceValues ?? (propertyTypeCode === 'Extension' && slices.length > 0));
  const propertyDisplayName = getPathDisplayName(property.path);

  return (
    <Stack className={props.indent ? classes.indented : undefined}>
      {slices.map((slice, sliceIndex) => {
        return (
          <SliceInput
            slice={slice}
            key={slice.name}
            path={props.path}
            property={property}
            defaultValue={slicedValues[sliceIndex]}
            onChange={(newValue: any[]) => {
              setValuesWrapper(newValue, sliceIndex);
            }}
            testId={`slice-${slice.name}`}
          />
        );
      })}

      {showNonSliceValues &&
        nonSliceValues.map((value, valueIndex) => (
          <Group key={`${valueIndex}-${nonSliceValues.length}`} wrap="nowrap" style={{ flexGrow: 1 }}>
            <div style={{ flexGrow: 1 }}>
              <ResourcePropertyInput
                arrayElement={true}
                property={props.property}
                name={props.name + '.' + valueIndex}
                path={props.path}
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
            <ArrayRemoveButton
              propertyDisplayName={propertyDisplayName}
              testId={`nonsliced-remove-${valueIndex}`}
              onClick={(e: MouseEvent) => {
                killEvent(e);
                const newNonSliceValues = [...nonSliceValues];
                newNonSliceValues.splice(valueIndex, 1);
                setValuesWrapper(newNonSliceValues, nonSliceIndex);
              }}
            />
          </Group>
        ))}
      {showNonSliceValues && slicedValues.flat().length < property.max && (
        <Group wrap="nowrap" style={{ justifyContent: 'flex-start' }}>
          <ArrayAddButton
            propertyDisplayName={propertyDisplayName}
            onClick={(e: MouseEvent) => {
              killEvent(e);
              const newNonSliceValues = [...nonSliceValues];
              newNonSliceValues.push(undefined);
              setValuesWrapper(newNonSliceValues, nonSliceIndex);
            }}
            testId="nonsliced-add"
          />
        </Group>
      )}
    </Stack>
  );
}
