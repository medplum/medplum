import { DeviceName } from '@medplum/core';
import React from 'react';

export interface DeviceNameDisplayProps {
  value?: DeviceName;
}

export function DeviceNameDisplay(props: DeviceNameDisplayProps) {
  return (
    <div>{JSON.stringify(props.value)}</div>
  );
}
