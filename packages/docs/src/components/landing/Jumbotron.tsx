import { ReactNode } from 'react';
import styles from './Jumbotron.module.css';

export interface JumbotronProps {
  children?: ReactNode;
}

export function Jumbotron(props: JumbotronProps): JSX.Element {
  return <div className={styles.jumbotron}>{props.children}</div>;
}
