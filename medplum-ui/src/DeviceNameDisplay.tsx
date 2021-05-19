import { DeviceDeviceName } from 'medplum';
import React from 'react';

export interface DeviceNameDisplayProps {
  value?: DeviceDeviceName;
}

export function DeviceNameDisplay(props: DeviceNameDisplayProps) {
  return (
    <div>{JSON.stringify(props.value)}</div>
  );
}
