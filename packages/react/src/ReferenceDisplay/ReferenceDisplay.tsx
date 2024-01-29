import { stringify } from '@medplum/core';
import { Reference } from '@medplum/fhirtypes';
import { MedplumLink } from '../MedplumLink/MedplumLink';

export interface ReferenceDisplayProps {
  readonly value?: Reference;
  readonly link?: boolean;
}

export function ReferenceDisplay(props: ReferenceDisplayProps): JSX.Element | null {
  if (!props.value) {
    return null;
  }

  const displayString = props.value.display || props.value.reference || stringify(props.value);

  // The "link" prop defaults to "true"; undefined is treated as "true"
  // To disable the link, it must be explicitly "false"
  if (props.link !== false && props.value.reference) {
    return <MedplumLink to={props.value}>{displayString}</MedplumLink>;
  } else {
    return <>{displayString}</>;
  }
}
