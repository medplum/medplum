import React from 'react';

export interface InputRowProps {
  children: React.ReactNode;
}

export function InputRow(props: InputRowProps): JSX.Element {
  return <div style={{ display: 'flex', width: '100%', gap: '3px', alignItems: 'center' }}>{props.children}</div>;
}
