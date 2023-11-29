import { InternalSchemaElement } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';

export interface ComplexTypeInputProps<ValueType> {
  property: InternalSchemaElement;
  name: string;
  defaultValue?: ValueType;
  onChange: ((value: ValueType, propName?: string) => void) | undefined;
  outcome: OperationOutcome | undefined;
}
