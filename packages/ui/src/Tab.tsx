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
  // The onClick prop is set by TabBar as parent component.
  // Using Tab outside of a TabBar is unsupported.
  return (
    <div
      role="button"
      tabIndex={0}
      className={className}
      onClick={() => (props.onClick as (name: string) => void)(props.name)}
    >
      {props.label}
    </div>
  );
}
