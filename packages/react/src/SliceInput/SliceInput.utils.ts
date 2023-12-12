import { InternalTypeSchema, SliceDefinition } from '@medplum/core';

export type SupportedSliceDefinition = SliceDefinition & {
  type: NonNullable<SliceDefinition['type']>;
  typeSchema?: InternalTypeSchema;
};

export function isSupportedSliceDefinition(slice: SliceDefinition): slice is SupportedSliceDefinition {
  return slice.type !== undefined && slice.type.length > 0;
}
