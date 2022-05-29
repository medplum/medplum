import React from 'react';
import './InputRow.css';

export interface InputRowProps {
  justifyContent?: string;
  children: React.ReactNode;
}

export function InputRow(props: InputRowProps): JSX.Element {
  return (
    <div className="medplum-input-row" style={{ justifyContent: props.justifyContent }}>
      {props.children}
    </div>
  );
}
