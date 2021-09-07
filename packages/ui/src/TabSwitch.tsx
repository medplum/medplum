import React from 'react';
import { TabPanel } from './TabPanel';

export interface TabSwitchProps {
  value?: string;
  children: React.ReactNode;
}

export function TabSwitch(props: TabSwitchProps) {
  return (
    <>
      {React.Children.map(props.children, child => {
        if (React.isValidElement(child) &&
          child.type === TabPanel &&
          child.props.name === props.value) {
          return child;
        } else {
          return null;
        }
      })}
    </>
  );
}
