import { OperationOutcome } from '@medplum/fhirtypes';

export interface BaseInputProps {
  /** The path identifies the element and is expressed as a "."-separated list of ancestor elements, beginning with the name of the resource or extension. */
  readonly path: string;
  /** TODO */
  readonly indexedPath?: string;
  /** (optional) OperationOutcome from the last attempted system action*/
  readonly outcome?: OperationOutcome;
}

export interface ComplexTypeInputProps<ValueType> extends BaseInputProps {
  name: string;
  defaultValue?: ValueType;
  onChange: ((value: ValueType, propName?: string) => void) | undefined;
}

export interface PrimitiveTypeInputProps {
  id: string;
  name: string;
  'data-testid': string;
  defaultValue?: any;
  required: boolean;
  error: string | undefined;
}

export function getIndexedPath(path: string, indexedPath: string | undefined, arrayIndex?: number): string {
  if (indexedPath === undefined) {
    return path;
  }

  return arrayIndex === undefined ? indexedPath : `${indexedPath}[${arrayIndex}]`;
}
