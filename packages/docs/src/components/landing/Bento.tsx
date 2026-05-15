// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX, ReactNode } from 'react';
import styles from './Bento.module.css';

export interface BentoProps {
  readonly children: ReactNode;
}

export function Bento(props: BentoProps): JSX.Element {
  return <div className={styles.bento}>{props.children}</div>;
}

export type BentoSpan = 2 | 3 | 4 | 6;
export type BentoAccent = 'plain' | 'violet' | 'indigo' | 'orange';

export interface BentoCellProps {
  readonly icon?: ReactNode;
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
  readonly span?: BentoSpan;
  readonly accent?: BentoAccent;
  readonly children?: ReactNode;
}

export function BentoCell(props: BentoCellProps): JSX.Element {
  const span = props.span ?? 2;
  const accent = props.accent ?? 'plain';
  const className = [styles.cell, styles[`span${span}`], styles[accent]].join(' ');
  return (
    <div className={className}>
      {props.icon && <div className={styles.icon}>{props.icon}</div>}
      {props.eyebrow && <div className={styles.eyebrow}>{props.eyebrow}</div>}
      <h3 className={styles.title}>{props.title}</h3>
      <p className={styles.description}>{props.description}</p>
      {props.children}
    </div>
  );
}
