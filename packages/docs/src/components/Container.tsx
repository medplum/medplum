import { ReactNode } from 'react';

export interface ContainerProps {
  children?: ReactNode;
}

export function Container(props: ContainerProps): JSX.Element {
  return <main className="container">{props.children}</main>;
}
