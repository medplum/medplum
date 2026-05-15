// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconPlus } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import styles from './FAQ.module.css';

export interface FAQGroupProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function FAQGroup(props: FAQGroupProps): JSX.Element {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{props.title}</h2>
      <div className={styles.list}>{props.children}</div>
    </section>
  );
}

export interface FAQItemProps {
  readonly question: string;
  readonly children: ReactNode;
}

export function FAQItem(props: FAQItemProps): JSX.Element {
  return (
    <details className={styles.item}>
      <summary className={styles.summary}>
        <span className={styles.question}>{props.question}</span>
        <span className={styles.toggle} aria-hidden="true">
          <IconPlus size={18} stroke={2} />
        </span>
      </summary>
      <div className={styles.answer}>{props.children}</div>
    </details>
  );
}
