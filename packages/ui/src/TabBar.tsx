import React from 'react';
import { Tab } from './Tab';
import './TabBar.css';

export interface TabBarProps {
  value?: string;
  onChange: (name: string) => void;
  children: React.ReactNode;
}

export function TabBar(props: TabBarProps) {
  return (
    <div className="medplum-tabbar">
      <div className="medplum-tabbar-background"></div>
      <div className="medplum-tabbar-foreground">
        {React.Children.map(props.children, child => {
          if (React.isValidElement(child) && child.type === Tab) {
            return React.cloneElement(child as React.ReactElement<any>, {
              selected: child.props.name === props.value,
              onClick: props.onChange
            });
          } else {
            return null;
          }
        })}
      </div>
    </div>
  );
}
