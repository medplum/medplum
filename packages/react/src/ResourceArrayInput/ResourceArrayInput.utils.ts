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
import { ElementsContextType } from '../ElementsInput/ElementsInput.utils';

function isDiscriminatorComponentMatch(
  typedValue: TypedValue,
  discriminator: SliceDiscriminator,
  slice: SupportedSliceDefinition,
  profileUrl: string | undefined,
  elements: ElementsContextType['elements']
): boolean {
  const elementList = slice.typeSchema?.elements ?? slice.elements;
  if (discriminator.path.includes('.')) {
    console.log('assignValues dotted', discriminator.path, slice.typeSchema?.elements, slice.elements, elements);
  }

  // const pathParts = discriminator.path.split('.');
  // let lastEd: InternalSchemaElement | undefined;
  // let lastNestedProp: TypedValue | TypedValue[] | undefined;
  // for (let i = 0; i < pathParts.length; i++) {
  //   const pathPart = pathParts[i];
  //   const pathSoFar = pathParts.slice(0, i+1).join('.')
  //   lastEd = getElementDefinitionFromElements(elementList, pathSoFar);
  //   if (lastEd) {
  //     lastNestedProp = getTypedPropertyValueWithSchema(typedValue, discriminator.path, lastEd);
  //   }
  // }
  // nestedProp = lastNestedProp;

  // let nestedProp: TypedValue | TypedValue[] | undefined;
  // const ed = getElementDefinitionFromElements(elementList, discriminator.path);
  // if (ed) {
  // nestedProp = getTypedPropertyValueWithSchema(typedValue, discriminator.path, ed);
  // }

  const nestedProp = getNestedProperty(typedValue, discriminator.path, profileUrl);

  if (nestedProp) {
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
  elements: ElementsContextType['elements'],
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
        isDiscriminatorComponentMatch(typedValue, d, slice, slice.typeSchema?.url ?? profileUrl, elements)
      )
    ) {
      return slice.name;
    }
  }
  return undefined;
}

function assignValuesIntoSlicesImpl(
  values: any[],
  slices: SupportedSliceDefinition[],
  slicing: SlicingRules | undefined,
  elements: ElementsContextType['elements'],
  profileUrl: string | undefined
): any[][] {
  if (!slicing || slicing.slices.length === 0) {
    console.log('assignValues no slicing or slices');
    return [values];
  }

  // store values in an array of arrays: one for each slice plus another for non-sliced values
  const slicedValues: any[][] = new Array(slices.length + 1);
  for (let i = 0; i < slicedValues.length; i++) {
    slicedValues[i] = [];
  }

  // console.log('assignValues TOP', values, slices, slicing, elements, profileUrl);
  for (const value of values) {
    const sliceName = getValueSliceName(value, slices, slicing.discriminator, elements, profileUrl);
    if (!isPopulated(sliceName)) {
      console.debug('slice value assigned to default slice', value, slicing);
    }
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
      }
    } else if (sliceValues.length === 0) {
      sliceValues.push(undefined);
    }
  }

  return slicedValues;
}

export async function assignValuesIntoSlices({
  medplum,
  property,
  defaultValue,
  elementsContext,
}: {
  medplum: MedplumClient;
  property: InternalSchemaElement;
  defaultValue: any[];
  elementsContext: ElementsContextType;
}): Promise<{ slices: SupportedSliceDefinition[]; slicedValues: any[][] }> {
  return new Promise((resolve, reject) => {
    if (!property.slicing) {
      resolve({ slices: [], slicedValues: [defaultValue] });
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
        const results = assignValuesIntoSlicesImpl(
          defaultValue,
          supportedSlices,
          property.slicing,
          elementsContext.elements,
          elementsContext.profileUrl
        );

        resolve({ slices: supportedSlices, slicedValues: results });
      })
      .catch(reject);
  });
}
