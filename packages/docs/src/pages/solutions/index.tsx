// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Layout from '@theme/Layout';
import type { JSX } from 'react';
import { LogoScroller } from '../../components/landing/LogoScroller';
import { SectionHeader } from '../../components/landing/SectionHeader';
import { SolutionsCategoryNav } from '../../components/landing/SolutionsCategoryNav';
import { SolutionsCategorySection } from '../../components/landing/SolutionsCategorySection';
import { SolutionsCta } from '../../components/landing/SolutionsCta';
import { SolutionsHero } from '../../components/landing/SolutionsHero';
import { SOLUTIONS_CATEGORIES, SOLUTIONS_LOGOS_HEADING } from '../../data/solutions-content';
import styles from './solutions.module.css';

export default function SolutionsPage(): JSX.Element {
  return (
    <Layout
      title="Solutions"
      description="Explore the custom EHRs, patient apps, and healthcare platforms leading organizations have built on Medplum."
    >
      <div className={styles.page}>
        <SolutionsHero />
        <div className={styles.logos}>
          <SectionHeader style={{ marginBottom: '0', marginTop: '0' }}>
            <h3>{SOLUTIONS_LOGOS_HEADING}</h3>
          </SectionHeader>
          <LogoScroller />
        </div>
        <SolutionsCategoryNav />
        {SOLUTIONS_CATEGORIES.map((category, index) => (
          <SolutionsCategorySection key={category.id} category={category} index={index} tinted={index % 2 === 1} />
        ))}
        <SolutionsCta />
      </div>
    </Layout>
  );
}
