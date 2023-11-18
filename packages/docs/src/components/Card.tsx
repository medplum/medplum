import { ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps {
  children?: ReactNode;
}

export function Card(props: CardProps): JSX.Element {
  return <div className={styles.card}>{props.children}</div>;
}
