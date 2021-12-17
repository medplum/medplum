import { formatAddress } from '@medplum/core';
import { Address } from '@medplum/fhirtypes';
import React from 'react';

export interface AddressDisplayProps {
  value?: Address;
}

export function AddressDisplay(props: AddressDisplayProps) {
  const address = props.value;
  if (!address) {
    return null;
  }

  return <>{formatAddress(address)}</>;
}
