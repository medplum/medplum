import React from 'react';
import './TitleBar.css';

export interface TitleBarProps {
  children?: React.ReactNode;
}

export function TitleBar(props: TitleBarProps): JSX.Element {
  return (
    <div className="medplum-title-bar">
      {props.children}
    </div>
  );
}
