// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { IconArrowRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import { SOLUTIONS_HERO } from '../../data/solutions-content';
import styles from './SolutionsHero.module.css';

export function SolutionsHero(): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <p className={styles.eyebrow}>Solutions</p>
        <h1 className={styles.headline}>{SOLUTIONS_HERO.headline}</h1>
        <p className={styles.lead}>{SOLUTIONS_HERO.sub}</p>
        <div className={styles.cta}>
          <Link to={SOLUTIONS_HERO.primaryCta.href} className={styles.purpleButton}>
            {SOLUTIONS_HERO.primaryCta.label} <IconArrowRight size={16} />
          </Link>
          <Link to={SOLUTIONS_HERO.secondaryCta.href} className={styles.whiteButton}>
            {SOLUTIONS_HERO.secondaryCta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
