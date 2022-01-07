import React from 'react';
import './Scrollable.css';

export interface ScrollableProps {
  readonly backgroundColor?: string;
  readonly height: string | number;
  readonly children: React.ReactNode;
}

export function Scrollable(props: ScrollableProps): JSX.Element {
  return (
    <div
      className="medplum-scrollable-container"
      style={{ backgroundColor: props.backgroundColor, height: props.height }}
    >
      <div
        className="medplum-scrollable-content"
        style={{ backgroundColor: props.backgroundColor, height: props.height }}
      >
        {props.children}
      </div>
    </div>
  );
}
