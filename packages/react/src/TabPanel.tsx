import React from 'react';

export interface TabPanelProps {
  name: string;
  children: React.ReactNode;
}

export function TabPanel(props: TabPanelProps): JSX.Element {
  return <div role="tabpanel">{props.children}</div>;
}
