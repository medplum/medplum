import React from 'react';

export interface DateTimeDisplayProps {
  value?: string;
}

export function DateTimeDisplay(props: DateTimeDisplayProps): JSX.Element | null {
  if (!props.value) {
    return null;
  }
  return <>{new Date(props.value).toLocaleString()}</>;
}
