import React from 'react';
import { TabPanel } from './TabPanel';

export interface TabSwitchProps {
  value?: string;
  // onChange?: (name: string) => void;
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
          // return React.cloneElement(child as React.ReactElement<any>, {
          //   selected: child.props.name === props.value,
          //   onClick: (name: string) => {
          //     if (props.onChange) {
          //       props.onChange(name);
          //     }
          //   }
          // });
        }
      })}
    </>
  );
}
