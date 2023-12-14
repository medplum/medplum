import { ActionIcon, Group, Stack } from '@mantine/core';
import {
  InternalSchemaElement,
  InternalTypeSchema,
  SliceDiscriminator,
  SlicingRules,
  TypedValue,
  arrayify,
  getElementDefinitionFromElements,
  getTypedPropertyValueWithSchema,
  isEmpty,
  matchDiscriminant,
  tryGetProfile,
} from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconCircleMinus, IconCirclePlus } from '@tabler/icons-react';
import { MouseEvent, useEffect, useState } from 'react';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { SliceInput } from '../SliceInput/SliceInput';
import { SupportedSliceDefinition, isSupportedSliceDefinition } from '../SliceInput/SliceInput.utils';
import { killEvent } from '../utils/dom';

export interface ResourceArrayInputProps {
  property: InternalSchemaElement;
  name: string;
  defaultValue?: any[];
  indent?: boolean;
  arrayElement?: boolean;
  outcome: OperationOutcome | undefined;
  onChange?: (value: any[]) => void;
  hideNonSliceValues?: boolean;
}

function getValueSliceName(
  value: any,
  slices: SupportedSliceDefinition[],
  discriminators: SliceDiscriminator[]
): string | undefined {
  if (!value) {
    return undefined;
  }

  for (const slice of slices) {
    let typedValue: TypedValue;
    if (slice.typeSchema) {
      typedValue = { type: slice.typeSchema.name, value };
    } else {
      typedValue = { type: slice.type[0].code, value };
    }

    if (
      discriminators.every((discriminator) => {
        let nestedProp: TypedValue | TypedValue[] | undefined;
        let elements: InternalTypeSchema['elements'] = slice.elements;

        if (!isEmpty(slice.elements)) {
          const ed = getElementDefinitionFromElements(slice.elements, discriminator.path);
          if (ed) {
            nestedProp = getTypedPropertyValueWithSchema(typedValue.value, discriminator.path, ed);
          }
        }

        if (!nestedProp && slice.typeSchema && !isEmpty(slice.typeSchema?.elements)) {
          elements = slice.typeSchema.elements;
          const ed = getElementDefinitionFromElements(slice.typeSchema.elements, discriminator.path);
          if (ed) {
            nestedProp = getTypedPropertyValueWithSchema(typedValue.value, discriminator.path, ed);
          }
        }

        if (!nestedProp) {
          return undefined;
        }

        return arrayify(nestedProp)?.some((v: any) => matchDiscriminant(v, discriminator, slice, elements));
      })
    ) {
      return slice.name;
    }
  }
  return undefined;
}

function assignValuesIntoSlices(
  values: any[],
  slices: SupportedSliceDefinition[],
  slicing: SlicingRules | undefined
): any[][] {
  if (!slicing || slicing.slices.length === 0) {
    return [values];
  }

  // store values in an array of arrays: one for each slice plus another for non-sliced values
  const slicedValues: any[][] = new Array(slices.length + 1);
  for (let i = 0; i < slicedValues.length; i++) {
    slicedValues[i] = [];
  }

  for (const value of values) {
    const sliceName = getValueSliceName(value, slices, slicing.discriminator);
    let sliceIndex = sliceName ? slices.findIndex((slice) => slice.name === sliceName) : -1;
    if (sliceIndex === -1) {
      sliceIndex = slices.length; // values not matched to a slice go in the last entry for non-slice
    }
    slicedValues[sliceIndex].push(value);
  }

  // for slices without existing values, add a placeholder empty value
  for (let i = 0; i < slices.length; i++) {
    if (slicedValues[i].length === 0) {
      slicedValues[i].push(undefined);
    }
  }

  return slicedValues;
}

export function ResourceArrayInput(props: ResourceArrayInputProps): JSX.Element {
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

  return (
    <Stack style={props.indent ? { marginTop: '1rem', marginLeft: '1rem' } : undefined}>
      {slices.map((slice, sliceIndex) => {
        return (
          <SliceInput
            slice={slice}
            key={slice.name}
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
                data-testid={`nonsliced-remove-${valueIndex}`}
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
      {showNonSliceValues && slicedValues.flat().length < property.max && (
        <Group noWrap style={{ justifyContent: 'flex-end' }}>
          <div>
            <ActionIcon
              title="Add"
              size="sm"
              color="green"
              data-testid={`nonsliced-add`}
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
