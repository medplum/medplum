// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { IconArrowRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import {
  SOLUTIONS_CTA,
  SOLUTIONS_MORE_CASE_STUDIES,
  SOLUTIONS_MORE_CASE_STUDIES_HEADING,
} from '../../data/solutions-content';
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

        <div className={styles.moreStudies}>
          <div className={styles.moreHeader}>
            <h3 className={styles.moreHeading}>{SOLUTIONS_MORE_CASE_STUDIES_HEADING}</h3>
            <Link to="/case-studies" className={styles.moreLink}>
              View all <IconArrowRight size={15} stroke={2.5} aria-hidden />
            </Link>
          </div>
          <ul className={styles.logoStrip}>
            {SOLUTIONS_MORE_CASE_STUDIES.map((study) => (
              <li key={study.name}>
                <Link
                  to={study.url}
                  className={styles.logoTile}
                  aria-label={`${study.name} case study`}
                  {...(study.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                >
                  <img src={study.logoSrc} alt={study.name} className={styles.logoMark} loading="lazy" />
                  <span className={styles.logoName}>{study.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
