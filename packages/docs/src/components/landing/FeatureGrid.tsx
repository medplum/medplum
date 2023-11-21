import { CSSProperties, ReactNode } from 'react';
import styles from './FeatureGrid.module.css';

export interface FeatureGridProps {
  columns: number;
  children?: ReactNode;
}

export function FeatureGrid(props: FeatureGridProps): JSX.Element {
  return (
    <div className={styles.featureGrid} style={{ '--columns': props.columns } as CSSProperties}>
      {props.children}
    </div>
  );
}

export interface FeatureProps {
  imgSrc: string;
  title: string;
  children: ReactNode;
}

export function Feature(props: FeatureProps): JSX.Element {
  return (
    <div className={styles.featureCell}>
      <div className={styles.featureIcon}>
        <img src={props.imgSrc} loading="lazy" alt={props.title} width="28" height="28" />
      </div>
      <h3>{props.title}</h3>
      <p>{props.children}</p>
    </div>
  );
}
