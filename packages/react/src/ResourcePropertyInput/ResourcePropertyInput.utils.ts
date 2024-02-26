import { OperationOutcome } from '@medplum/fhirtypes';

export interface ComplexTypeInputProps<ValueType> {
  name: string;
  /** The path identifies the element and is expressed as a "."-separated list of ancestor elements, beginning with the name of the resource or extension. */
  path: string;
  defaultValue?: ValueType;
  onChange: ((value: ValueType, propName?: string) => void) | undefined;
  outcome: OperationOutcome | undefined;
}
