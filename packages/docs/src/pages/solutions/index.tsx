// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Layout from '@theme/Layout';
import type { JSX } from 'react';
import { SolutionsCategoryNav } from '../../components/landing/SolutionsCategoryNav';
import { SolutionsCategorySection } from '../../components/landing/SolutionsCategorySection';
import { SolutionsCta } from '../../components/landing/SolutionsCta';
import { SolutionsHero } from '../../components/landing/SolutionsHero';
import { SOLUTIONS_CATEGORIES } from '../../data/solutions-content';
import styles from './solutions.module.css';

export default function SolutionsPage(): JSX.Element {
  return (
    <Layout
      title="Solutions"
      description="Explore the custom EHRs, patient apps, and healthcare platforms leading organizations have built on Medplum."
    >
      <div className={styles.page}>
        <SolutionsHero />
        <div className={styles.layout}>
          <SolutionsCategoryNav />
          <main className={styles.sections}>
            {SOLUTIONS_CATEGORIES.map((category) => (
              <SolutionsCategorySection key={category.id} category={category} />
            ))}
          </main>
        </div>
        <SolutionsCta />
      </div>
    </Layout>
  );
}
