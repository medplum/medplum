// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import type { JSX } from 'react';
import { SOLUTIONS_CTA } from '../../data/solutions-content';
import styles from './SolutionsCta.module.css';

export function SolutionsCta(): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <h2 className={styles.headline}>{SOLUTIONS_CTA.headline}</h2>
        <p className={styles.body}>{SOLUTIONS_CTA.body}</p>
        <div className={styles.buttons}>
          <Link to={SOLUTIONS_CTA.primaryCta.href} className={styles.purpleButton}>
            {SOLUTIONS_CTA.primaryCta.label}
          </Link>
          <Link to={SOLUTIONS_CTA.secondaryCta.href} className={styles.whiteButton}>
            {SOLUTIONS_CTA.secondaryCta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
