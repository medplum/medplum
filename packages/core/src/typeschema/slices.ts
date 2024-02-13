import { TypedValue } from '../types';
import { getNestedProperty } from './crawler';
import { InternalTypeSchema, SliceDefinition, SliceDiscriminator } from './types';
import { matchDiscriminant } from './validation';

export type SliceDefinitionWithTypes = SliceDefinition & {
  type: NonNullable<SliceDefinition['type']>;
  typeSchema?: InternalTypeSchema;
};

export function isSliceDefinitionWithTypes(slice: SliceDefinition): slice is SliceDefinitionWithTypes {
  return slice.type !== undefined && slice.type.length > 0;
}

function isDiscriminatorComponentMatch(
  typedValue: TypedValue,
  discriminator: SliceDiscriminator,
  slice: SliceDefinitionWithTypes,
  profileUrl: string | undefined
): boolean {
  const nestedProp = getNestedProperty(typedValue, discriminator.path, { profileUrl });

  if (nestedProp) {
    const elements = slice.typeSchema?.elements ?? slice.elements;
    return nestedProp.some((v: any) => matchDiscriminant(v, discriminator, slice, elements)) ?? false;
  }

  console.assert(false, 'getNestedProperty[%s] in isDiscriminatorComponentMatch missed', discriminator.path);
  return false;
}

export function getValueSliceName(
  value: any,
  slices: SliceDefinitionWithTypes[],
  discriminators: SliceDiscriminator[],
  profileUrl: string | undefined
): string | undefined {
  if (!value) {
    return undefined;
  }

  for (const slice of slices) {
    const typedValue: TypedValue = {
      value,
      type: slice.typeSchema?.name ?? slice.type?.[0].code,
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
