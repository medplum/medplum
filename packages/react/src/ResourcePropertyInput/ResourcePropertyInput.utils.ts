import { OperationOutcome } from '@medplum/fhirtypes';

export interface ComplexTypeInputProps<ValueType> {
  name: string;
  path: string;
  defaultValue?: ValueType;
  onChange: ((value: ValueType, propName?: string) => void) | undefined;
  outcome: OperationOutcome | undefined;
}
