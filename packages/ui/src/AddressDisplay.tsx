import { Address } from '@medplum/core';
import React from 'react';

export interface AddressDisplayProps {
  value?: Address;
}

export function AddressDisplay(props: AddressDisplayProps) {
  const address = props.value;
  if (!address) {
    return null;
  }

  const builder = [];

  if (address.line) {
    builder.push(...address.line);
  }

  if (address.city) {
    builder.push(address.city);
  }

  if (address.state) {
    builder.push(address.state);
  }

  if (address.postalCode) {
    builder.push(address.postalCode);
  }

  if (address.use) {
    builder.push('[' + address.use + ']');
  }

  return <>{builder.join(', ').trim()}</>;
}
