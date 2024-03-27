import { OperationOutcome } from '@medplum/fhirtypes';

export interface BaseInputProps {
  /** The path identifies the element and is expressed as a "."-separated list of ancestor elements, beginning with the name of the resource or extension. */
  readonly path: string;
  /** (optional) A FHIRPath expression that identifies the input more precisely than `path`, e.g. `Patient.identifier[0].system` versus `Patient.identifier.system` */
  readonly expression?: string;
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

export function getExpression(path: string, expression: string | undefined, arrayIndex?: number): string {
  if (expression === undefined) {
    return path;
  }

  return arrayIndex === undefined ? expression : `${expression}[${arrayIndex}]`;
}
