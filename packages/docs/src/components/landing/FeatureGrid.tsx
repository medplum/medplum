// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import type { CSSProperties, JSX, ReactNode } from 'react';
import styles from './FeatureGrid.module.css';

export interface FeatureGridProps {
  readonly columns: number;
  readonly children?: ReactNode;
  readonly variant?: 'default' | 'ecosystem' | 'complexity';
}

export function FeatureGrid(props: FeatureGridProps): JSX.Element {
  const classNames = [styles.featureGrid];
  if (props.variant === 'ecosystem') {
    classNames.push(styles.ecosystemVariant);
  } else if (props.variant === 'complexity') {
    classNames.push(styles.complexityVariant);
  }

  return (
    <div className={classNames.join(' ')} style={{ '--columns': props.columns } as CSSProperties}>
      {props.children}
    </div>
  );
}

export interface FeatureProps {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly children: ReactNode;
  readonly linkRef?: string;
  readonly linkText?: string;
}

export function Feature(props: FeatureProps): JSX.Element {
  return (
    <div className={styles.featureCell}>
      {props.icon && <div className={styles.featureIcon}>{props.icon}</div>}
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
