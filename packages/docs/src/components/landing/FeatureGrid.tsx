import Link from '@docusaurus/Link';
import { CSSProperties, JSX, ReactNode } from 'react';
import styles from './FeatureGrid.module.css';

export interface FeatureGridProps {
  readonly columns: number;
  readonly children?: ReactNode;
}

export function FeatureGrid(props: FeatureGridProps): JSX.Element {
  return (
    <div className={styles.featureGrid} style={{ '--columns': props.columns } as CSSProperties}>
      {props.children}
    </div>
  );
}

export interface FeatureProps {
  readonly imgSrc?: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly linkRef?: string;
  readonly linkText?: string;
}

export function Feature(props: FeatureProps): JSX.Element {
  return (
    <div className={styles.featureCell}>
      {props.imgSrc && (
        <div className={styles.featureIcon}>
          <img src={props.imgSrc} loading="lazy" alt={props.title} width="28" height="28" />
        </div>
      )}
      <h3>{props.title}</h3>
      <p>{props.children}</p>
      {props.linkRef && props.linkText && (
        <Link href={props.linkRef} className={styles.actionButton}>
          {props.linkText}
        </Link>
      )}
    </div>
  );
}
