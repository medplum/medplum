// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TypedValue } from '../types';
import type { InternalTypeSchema, SliceDefinition, SliceDiscriminator } from './types';
import { matchDiscriminatorOnParent } from './validation';

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
  return matchDiscriminatorOnParent(
    typedValue,
    discriminator,
    slice,
    slice.typeSchema?.elements ?? slice.elements,
    profileUrl
  );
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
      type: slice.typeSchema?.type ?? slice.type?.[0].code,
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
