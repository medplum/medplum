import { formatAddress } from '@medplum/core';
import { Address } from '@medplum/fhirtypes';

export interface AddressDisplayProps {
  readonly value?: Address;
}

export function AddressDisplay(props: AddressDisplayProps): JSX.Element | null {
  const address = props.value;
  if (!address) {
    return null;
  }

  return <>{formatAddress(address)}</>;
}
