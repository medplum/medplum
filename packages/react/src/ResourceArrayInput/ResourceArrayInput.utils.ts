import {
  InternalSchemaElement,
  MedplumClient,
  SliceDefinitionWithTypes,
  SlicingRules,
  getValueSliceName,
  isPopulated,
  isSliceDefinitionWithTypes,
  tryGetProfile,
} from '@medplum/core';

export function assignValuesIntoSlices(
  values: any[],
  slices: SliceDefinitionWithTypes[],
  slicing: SlicingRules | undefined,
  profileUrl: string | undefined
): any[][] {
  if (!isPopulated(slicing?.slices)) {
    return [values];
  }

  // store values in an array of arrays: one for each slice plus another for non-sliced values
  const slicedValues: any[][] = new Array(slices.length + 1);
  for (let i = 0; i < slicedValues.length; i++) {
    slicedValues[i] = [];
  }

  for (const value of values) {
    const sliceName = getValueSliceName(value, slices, slicing.discriminator, profileUrl);

    let sliceIndex = sliceName ? slices.findIndex((slice) => slice.name === sliceName) : -1;
    // -1 can come from either findIndex or the ternary else
    if (sliceIndex === -1) {
      sliceIndex = slices.length;
    }
    slicedValues[sliceIndex].push(value);
  }

  return slicedValues;
}

export async function prepareSlices({
  medplum,
  property,
}: {
  medplum: MedplumClient;
  property: InternalSchemaElement;
}): Promise<SliceDefinitionWithTypes[]> {
  return new Promise((resolve, reject) => {
    if (!property.slicing) {
      resolve([]);
      return;
    }

    const supportedSlices: SliceDefinitionWithTypes[] = [];
    const profileUrls: (string | undefined)[] = [];
    const promises: Promise<string[]>[] = [];
    for (const slice of property.slicing.slices) {
      if (!isSliceDefinitionWithTypes(slice)) {
        console.debug('Unsupported slice definition', slice);
        continue;
      }

      let profileUrl: string | undefined;
      // If elements are not defined for the slice, look for a profile
      if (!isPopulated(slice.elements)) {
        profileUrl = slice.type[0]?.profile?.[0];
      }

      // important to keep these three arrays the same length;
      supportedSlices.push(slice);
      profileUrls.push(profileUrl);
      if (profileUrl) {
        promises.push(medplum.requestProfileSchema(profileUrl));
      } else {
        promises.push(Promise.resolve([]));
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
