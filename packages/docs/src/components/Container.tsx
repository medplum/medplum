import { ReactNode } from 'react';

export interface ContainerProps {
  readonly children?: ReactNode;
}

export function Container(props: ContainerProps): JSX.Element {
  return <main className="container">{props.children}</main>;
}
