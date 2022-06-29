import React from 'react';
import './StatusBadge.css';

export interface StatusBadgeProps {
  readonly status: string;
}

export function StatusBadge(props: StatusBadgeProps): JSX.Element {
  return <span className={`medplum-status medplum-status-${props.status}`}>{props.status}</span>;
}
