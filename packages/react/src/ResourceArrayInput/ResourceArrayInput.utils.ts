import {
  InternalTypeSchema,
  SliceDefinition,
  SliceDiscriminator,
  SlicingRules,
  TypedValue,
  arrayify,
  getElementDefinitionFromElements,
  getTypedPropertyValueWithSchema,
  isPopulated,
  matchDiscriminant,
} from '@medplum/core';

function isDiscriminatorComponentMatch(
  typedValue: TypedValue,
  discriminator: SliceDiscriminator,
  slice: SupportedSliceDefinition
): boolean {
  for (const elementList of [slice.elements, slice.typeSchema?.elements]) {
    let nestedProp: TypedValue | TypedValue[] | undefined;
    if (isPopulated(elementList)) {
      const ed = getElementDefinitionFromElements(elementList, discriminator.path);
      if (ed) {
        nestedProp = getTypedPropertyValueWithSchema(typedValue.value, discriminator.path, ed);
      }
    }

    if (nestedProp) {
      return arrayify(nestedProp)?.some((v: any) => matchDiscriminant(v, discriminator, slice, elementList)) ?? false;
    }
  }

  return false;
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
    const typedValue: TypedValue = {
      value,
      type: slice.typeSchema?.name ?? slice.type[0].code,
    };
    if (discriminators.every((d) => isDiscriminatorComponentMatch(typedValue, d, slice))) {
      return slice.name;
    }
  }
  return undefined;
}

export function assignValuesIntoSlices(
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

export type SupportedSliceDefinition = SliceDefinition & {
  type: NonNullable<SliceDefinition['type']>;
  typeSchema?: InternalTypeSchema;
};

export function isSupportedSliceDefinition(slice: SliceDefinition): slice is SupportedSliceDefinition {
  return slice.type !== undefined && slice.type.length > 0;
}
