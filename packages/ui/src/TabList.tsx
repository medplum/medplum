import React from 'react';
import { Scrollable } from './Scrollable';
import { Tab, TabClickHandler } from './Tab';
import './TabList.css';

export interface TabListProps {
  value?: string;
  onChange: TabClickHandler;
  children: React.ReactNode;
}

export function TabList(props: TabListProps): JSX.Element {
  return (
    <Scrollable className="surface" height={50}>
      <div role="tablist" className="medplum-tablist">
        <div className="medplum-tablist-foreground">
          {React.Children.map(props.children, (child, tabIndex) => {
            if (React.isValidElement(child) && child.type === Tab) {
              return React.cloneElement(child as React.ReactElement<any>, {
                selected: child.props.name === props.value,
                onClick: props.onChange,
                tabIndex,
              });
            } else {
              return null;
            }
          })}
        </div>
      </div>
    </Scrollable>
  );
}
