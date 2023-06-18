import React from 'react';
import styles from './Section.module.css';

export interface SectionProps {
  children?: React.ReactNode;
}

export function Section(props: SectionProps): JSX.Element {
  return <div className={styles.section}>{props.children}</div>;
}
