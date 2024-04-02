import { formatHumanName, HumanNameFormatOptions } from '@medplum/core';
import { HumanName } from '@medplum/fhirtypes';

export interface HumanNameDisplayProps {
  readonly value?: HumanName;
  readonly options?: HumanNameFormatOptions;
}

export function HumanNameDisplay(props: HumanNameDisplayProps): JSX.Element | null {
  const name = props.value;
  if (!name) {
    return null;
  }

  return <>{formatHumanName(name, props.options)}</>;
}
