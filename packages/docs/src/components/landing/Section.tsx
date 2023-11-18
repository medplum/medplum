import { ReactNode } from 'react';
import styles from './Section.module.css';

export interface SectionProps {
  children?: ReactNode;
}

export function Section(props: SectionProps): JSX.Element {
  return <div className={styles.section}>{props.children}</div>;
}
