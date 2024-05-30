import { OperationOutcome } from '@medplum/fhirtypes';

export interface BaseInputProps {
  /** The path identifying the related element definition and is expressed as a "."-separated list of ancestor elements, beginning with the name of the resource or extension. */
  readonly path: string;
  /** (optional) A FHIRPath expression that identifies the input more precisely than `path`, e.g. `Patient.identifier[0].system` versus `Patient.identifier.system` */
  readonly valuePath?: string;
  /** (optional) OperationOutcome from the last attempted system action*/
  readonly outcome?: OperationOutcome;
}

export interface ComplexTypeInputProps<ValueType> extends BaseInputProps {
  readonly name: string;
  readonly defaultValue?: ValueType;
  readonly onChange?: (value: ValueType, propName?: string) => void;
  readonly disabled?: boolean;
}

export interface PrimitiveTypeInputProps {
  readonly id?: string;
  readonly name: string;
  readonly 'data-testid'?: string;
  readonly defaultValue?: any;
  readonly required?: boolean;
  readonly error?: string;
  readonly disabled?: boolean;
}

export function getValuePath(elementPath: string, valuePath: string | undefined, arrayIndex?: number): string {
  if (valuePath === undefined) {
    return elementPath;
  }

  return arrayIndex === undefined ? valuePath : `${valuePath}[${arrayIndex}]`;
}
