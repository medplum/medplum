import React from 'react';

export interface TabPanelProps {
  name: string;
  children: React.ReactNode;
}

export function TabPanel(props: TabPanelProps) {
  return <>{props.children}</>;
}
