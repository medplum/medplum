// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconArrowRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import { SOLUTIONS_HERO } from '../../data/solutions-content';
import { BuildDropdown } from './BuildDropdown';
import { LandingButton } from './LandingButton';
import { landingButtonClass } from './landingButtonClass';
import styles from './SolutionsHero.module.css';
import { SolutionsHeroAnimation } from './SolutionsHeroAnimation';

export function SolutionsHero(): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.copy}>
          <h1 className={styles.headline}>{SOLUTIONS_HERO.headline}</h1>
          <p className={styles.lead}>{SOLUTIONS_HERO.sub}</p>
          <div className={styles.cta}>
            <LandingButton to={SOLUTIONS_HERO.primaryCta.href} variant="purple" stretchMobile>
              {SOLUTIONS_HERO.primaryCta.label} <IconArrowRight size={16} />
            </LandingButton>
            <BuildDropdown
              label={SOLUTIONS_HERO.secondaryCta.label}
              triggerClassName={landingButtonClass('white', { stretchMobile: true })}
            />
          </div>
        </div>
        <div className={styles.visual}>
          <SolutionsHeroAnimation />
        </div>
      </div>
    </section>
  );
}
