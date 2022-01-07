import React from 'react';
import './Scrollable.css';

export interface ScrollableProps {
  readonly role?: string;
  readonly className?: string;
  readonly height?: number;
  readonly children: React.ReactNode;
}

export function Scrollable(props: ScrollableProps): JSX.Element {
  const containerHeight = props.height || '100%';
  const contentHeight = props.height ? props.height + 25 : '100%';
  const className = 'medplum-scrollable-content' + (props.className ? ` ${props.className}` : '');
  return (
    <div className="medplum-scrollable-container" style={{ height: containerHeight }}>
      <div className={className} role={props.role} style={{ height: contentHeight }}>
        {props.children}
      </div>
    </div>
  );
}
