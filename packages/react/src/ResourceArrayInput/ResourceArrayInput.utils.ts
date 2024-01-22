import {
  InternalSchemaElement,
  MedplumClient,
  SliceDiscriminator,
  SlicingRules,
  TypedValue,
  arrayify,
  getNestedProperty,
  isEmpty,
  isPopulated,
  matchDiscriminant,
  tryGetProfile,
} from '@medplum/core';
import { SupportedSliceDefinition, isSupportedSliceDefinition } from '../SliceInput/SliceInput.utils';

function isDiscriminatorComponentMatch(
  typedValue: TypedValue,
  discriminator: SliceDiscriminator,
  slice: SupportedSliceDefinition,
  profileUrl: string | undefined
): boolean {
  const nestedProp = getNestedProperty(typedValue, discriminator.path, profileUrl);

  if (nestedProp) {
    const elementList = slice.typeSchema?.elements ?? slice.elements;
    const result =
      arrayify(nestedProp)?.some((v: any) => matchDiscriminant(v, discriminator, slice, elementList)) ?? false;
    return result;
  } else {
    console.assert(false, 'getNestedProperty[%s] in isDiscriminatorComponentMatch missed', discriminator.path);
  }

  return false;
}
function getValueSliceName(
  value: any,
  slices: SupportedSliceDefinition[],
  discriminators: SliceDiscriminator[],
  profileUrl?: string
): string | undefined {
  if (!value) {
    return undefined;
  }

  for (const slice of slices) {
    const typedValue: TypedValue = {
      value,
      type: slice.typeSchema?.name ?? slice.type[0].code,
    };
    if (
      discriminators.every((d) =>
        isDiscriminatorComponentMatch(typedValue, d, slice, slice.typeSchema?.url ?? profileUrl)
      )
    ) {
      return slice.name;
    }
  }
  return undefined;
}

export function assignValuesIntoSlices(
  values: any[],
  slices: SupportedSliceDefinition[],
  slicing: SlicingRules | undefined,
  profileUrl: string | undefined
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
    const sliceName = getValueSliceName(value, slices, slicing.discriminator, profileUrl);

    // values not matched to a slice go in the last entry for non-slice
    const sliceIndex = sliceName ? slices.findIndex((slice) => slice.name === sliceName) : slices.length;
    slicedValues[sliceIndex].push(value);
  }

  // add placeholder empty values
  for (let sliceIndex = 0; sliceIndex < slices.length; sliceIndex++) {
    const slice = slices[sliceIndex];
    const sliceValues = slicedValues[sliceIndex];

    if (sliceValues.length < slice.min) {
      while (sliceValues.length < slice.min) {
        sliceValues.push(undefined);
      }
    } else if (sliceValues.length === 0) {
      sliceValues.push(undefined);
    }
  }

  return slicedValues;
}

export async function prepareSlices({
  medplum,
  property,
}: {
  medplum: MedplumClient;
  property: InternalSchemaElement;
}): Promise<SupportedSliceDefinition[]> {
  return new Promise((resolve, reject) => {
    if (!property.slicing) {
      resolve([]);
      return;
    }

    const supportedSlices: SupportedSliceDefinition[] = [];
    const profileUrls: (string | undefined)[] = [];
    const promises: Promise<void>[] = [];
    for (const slice of property.slicing.slices) {
      if (!isSupportedSliceDefinition(slice)) {
        console.debug('Unsupported slice definition', slice);
        continue;
      }

      let profileUrl: string | undefined;
      if (isEmpty(slice.elements) && isPopulated(slice.type) && isPopulated(slice.type[0].profile)) {
        profileUrl = slice.type[0].profile[0];
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
        resolve(supportedSlices);
      })
      .catch(reject);
  });
}
