// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import clsx from 'clsx';
import type { JSX, ReactNode } from 'react';
import styles from './ProductsSectionHeader.module.css';

export interface ProductsSectionHeaderProps {
  readonly headline: ReactNode;
  /** The lead paragraph text. */
  readonly children: ReactNode;
  /**
   * 'default' — section already sits inside a padded container (only a bottom gap is needed).
   * 'intro' — full-bleed section that must constrain and pad its own header (ProductsApps).
   */
  readonly variant?: 'default' | 'intro';
  /** When true, the lead expands to full width at the smallest breakpoint (ProductsHowItWorks). */
  readonly leadFullMobile?: boolean;
}

/** The headline + lead pair shared by the product page sections. */
export function ProductsSectionHeader(props: ProductsSectionHeaderProps): JSX.Element {
  const { headline, children, variant = 'default', leadFullMobile = false } = props;
  return (
    <div className={variant === 'intro' ? styles.intro : styles.header}>
      <h2 className={styles.headline}>{headline}</h2>
      <p className={clsx(styles.lead, leadFullMobile && styles.leadFullMobile)}>{children}</p>
    </div>
  );
}
