import { evalFhirPath } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';

export interface FhirPathDisplayProps {
  readonly resource: Resource;
  readonly path: string;
  readonly propertyType: string;
}

export function FhirPathDisplay(props: FhirPathDisplayProps): JSX.Element | null {
  let value;

  try {
    value = evalFhirPath(props.path, props.resource);
  } catch (err) {
    console.warn('FhirPathDisplay:', err);
    return null;
  }

  if (value.length > 1) {
    throw new Error(
      `Component "path" for "FhirPathDisplay" must resolve to a single element. \
       Received ${value.length} elements \
       [${JSON.stringify(value, null, 2)}]`
    );
  }
  return <ResourcePropertyDisplay value={value[0] || ''} propertyType={props.propertyType} />;
}
