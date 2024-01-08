import { Group, Stack } from '@mantine/core';
import { InternalSchemaElement, getPathDisplayName, isEmpty, tryGetProfile } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { MouseEvent, useEffect, useState } from 'react';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { SliceInput } from '../SliceInput/SliceInput';
import { SupportedSliceDefinition, isSupportedSliceDefinition } from '../SliceInput/SliceInput.utils';
import { ArrayAddButton } from '../buttons/ArrayAddButton';
import { ArrayRemoveButton } from '../buttons/ArrayRemoveButton';
import { killEvent } from '../utils/dom';
import classes from './ResourceArrayInput.module.css';
import { assignValuesIntoSlices } from './ResourceArrayInput.utils';

export interface ResourceArrayInputProps {
  property: InternalSchemaElement;
  name: string;
  path: string;
  defaultValue?: any[];
  indent?: boolean;
  arrayElement?: boolean;
  outcome: OperationOutcome | undefined;
  onChange?: (value: any[]) => void;
  hideNonSliceValues?: boolean;
}

export function ResourceArrayInput(props: Readonly<ResourceArrayInputProps>): JSX.Element {
  const { property } = props;
  const medplum = useMedplum();
  const [loading, setLoading] = useState(true);
  const [slices, setSlices] = useState<SupportedSliceDefinition[]>([]);
  // props.defaultValue should NOT be used after this; prefer the defaultValue state
  const [defaultValue] = useState<any[]>(() => (Array.isArray(props.defaultValue) ? props.defaultValue : []));
  const [slicedValues, setSlicedValues] = useState<any[][]>([[]]);

  const propertyTypeCode = property.type[0]?.code;
  useEffect(() => {
    if (!property.slicing) {
      const emptySlices: SupportedSliceDefinition[] = [];
      setSlices(emptySlices);
      const results = assignValuesIntoSlices(defaultValue, emptySlices, property.slicing);
      setSlicedValues(results);
      setLoading(false);
      return;
    }

    const supportedSlices: SupportedSliceDefinition[] = [];
    const profileUrls: (string | undefined)[] = [];
    const promises: Promise<void>[] = [];
    for (const slice of property.slicing.slices) {
      if (!isSupportedSliceDefinition(slice)) {
        continue;
      }

      const sliceType = slice.type[0];
      let profileUrl: string | undefined;
      if (isEmpty(slice.elements)) {
        if (sliceType.profile) {
          profileUrl = sliceType.profile[0];
        }
      }

      // important to keep these three arrays the same length;
      supportedSlices.push(slice);
      profileUrls.push(profileUrl);
      if (profileUrl) {
        promises.push(medplum.requestProfileSchema(profileUrl));
      } else {
        promises.push(Promise.resolve());
      }
    }

    Promise.all(promises)
      .then(() => {
        for (let i = 0; i < supportedSlices.length; i++) {
          const slice = supportedSlices[i];
          const profileUrl = profileUrls[i];
          if (profileUrl) {
            const typeSchema = tryGetProfile(profileUrl);
            slice.typeSchema = typeSchema;
          }
        }
        setSlices(supportedSlices);
        const results = assignValuesIntoSlices(defaultValue, supportedSlices, property.slicing);
        setSlicedValues(results);
        setLoading(false);
      })
      .catch((reason) => {
        console.error(reason);
        setLoading(false);
      });
  }, [medplum, property.slicing, propertyTypeCode, defaultValue]);

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
