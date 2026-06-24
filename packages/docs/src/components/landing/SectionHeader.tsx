import { CSSProperties, JSX, ReactNode } from 'react';
import styles from './SectionHeader.module.css';

export interface SectionHeaderProps {
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
}

export function SectionHeader(props: SectionHeaderProps): JSX.Element {
  return (
    <div className={styles.sectionHeader} style={props.style}>
      {props.children}
    </div>
  );
}
