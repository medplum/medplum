import React from 'react';
import './Tab.css';

export interface TabProps {
  name: string;
  label: string;
  selected?: boolean;
  onClick?: (name: string) => void;
}

export function Tab(props: TabProps) {
  let className = 'medplum-tab';
  if (props.selected) {
    className += ' selected';
  }
  return (
    <div
      role="button"
      tabIndex={0}
      className={className}
      onClick={() => {
        if (props.onClick) {
          props.onClick(props.name);
        }
      }}
    >{props.label}</div>
  );
}
