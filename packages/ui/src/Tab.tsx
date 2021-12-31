import React from 'react';
import './Tab.css';
import { killEvent } from './utils/dom';

export interface TabClickHandler {
  (name: string, button: number): void;
}

export interface TabProps {
  name: string;
  label: string;
  selected?: boolean;
  onClick?: TabClickHandler;
}

export function Tab(props: TabProps) {
  let className = 'medplum-tab';
  if (props.selected) {
    className += ' selected';
  }

  function clickHandler(e: React.MouseEvent): void {
    killEvent(e);

    // The onClick prop is set by TabBar as parent component.
    // Using Tab outside of a TabBar is unsupported.
    (props.onClick as TabClickHandler)(props.name, e.button);
  }

  return (
    <a
      href={`#${props.name}`}
      role="tab"
      aria-selected={props.selected}
      className={className}
      onClick={clickHandler}
      onAuxClick={clickHandler}
    >
      {props.label}
    </a>
  );
}
