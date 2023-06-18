import React from 'react';

export interface ContainerProps {
  children?: React.ReactNode;
}

export function Container(props: ContainerProps): JSX.Element {
  return <main className="container">{props.children}</main>;
}
