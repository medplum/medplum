import {
  SliceDiscriminator,
  SlicingRules,
  TypedValue,
  arrayify,
  getElementDefinitionFromElements,
  getTypedPropertyValueWithSchema,
  isPopulated,
  matchDiscriminant,
} from '@medplum/core';
import { SupportedSliceDefinition } from '../SliceInput/SliceInput.utils';

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
  for (let sliceIndex = 0; sliceIndex < slices.length; sliceIndex++) {
    const slice = slices[sliceIndex];
    const sliceValues = slicedValues[sliceIndex];

    if (sliceValues.length < slice.min) {
      while (sliceValues.length < slice.min) {
        sliceValues.push(undefined);
        continue;
        const defaultValue = Object.create(null);
        Object.entries(slice.elements).forEach(([key, element]) => {
          const fixedOrPattern = element.fixed ?? element.pattern;
          if (fixedOrPattern) {
            const keyParts = key.split('.');
            if (keyParts.length > 1) {
              let last = defaultValue;
              for (let i = 0; i < keyParts.length; i++) {
                const keyPart = keyParts[i];
                if (i === keyParts.length - 1) {
                  if (Array.isArray(last)) {
                    last.forEach((item) => (item[keyPart] = fixedOrPattern.value));
                  } else {
                    last[keyPart] = fixedOrPattern.value;
                  }
                } else {
                  if (!(keyPart in last)) {
                    const elementKey = keyParts.slice(0, i + 1).join('.');
                    last[keyPart] = slice.elements[elementKey].isArray ? [Object.create(null)] : Object.create(null);
                  }
                  last = last[keyPart];
                }
              }
            }
            console.log(slice, 'FIXED or PATTERN', key, fixedOrPattern, JSON.stringify(defaultValue));
          }
        });
        console.log(slice.path, 'FIXED FINAL', defaultValue);
        sliceValues.push(defaultValue);
      }
    } else if (sliceValues.length === 0) {
      sliceValues.push(undefined);
    }
  }

  return slicedValues;
}
