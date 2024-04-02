import { ReactNode } from 'react';
import styles from './SectionHeader.module.css';

export interface SectionHeaderProps {
  readonly children?: ReactNode;
}

export function SectionHeader(props: SectionHeaderProps): JSX.Element {
  return <div className={styles.sectionHeader}>{props.children}</div>;
}
