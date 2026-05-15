// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { IconArrowUpRight } from '@tabler/icons-react';
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
  /** When set, the entire cell becomes a link to this href. */
  readonly href?: string;
  readonly children?: ReactNode;
}

export function BentoCell(props: BentoCellProps): JSX.Element {
  const span = props.span ?? 2;
  const accent = props.accent ?? 'plain';
  const linkable = Boolean(props.href);
  const className = [styles.cell, styles[`span${span}`], styles[accent], linkable ? styles.linkable : '']
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      {props.icon && <div className={styles.icon}>{props.icon}</div>}
      {props.eyebrow && <div className={styles.eyebrow}>{props.eyebrow}</div>}
      <h3 className={styles.title}>{props.title}</h3>
      <p className={styles.description}>{props.description}</p>
      {props.children}
      {linkable && (
        <span className={styles.arrow} aria-hidden="true">
          <IconArrowUpRight size={16} stroke={2.25} />
        </span>
      )}
    </>
  );

  if (linkable && props.href) {
    return (
      <Link to={props.href} className={className}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
