// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Layout from '@theme/Layout';
import type { JSX } from 'react';
import { PlatformApps } from '../../components/landing/PlatformApps';
import { PlatformCta } from '../../components/landing/PlatformCta';
import { PlatformFoundations } from '../../components/landing/PlatformFoundations';
import { PlatformHero } from '../../components/landing/PlatformHero';
import { PlatformThreeTierIntro } from '../../components/landing/PlatformThreeTierIntro';
import { PlatformWorkflows } from '../../components/landing/PlatformWorkflows';
import styles from './products.module.css';

export default function ProductsPage(): JSX.Element {
  return (
    <Layout title="Products" description="The platform underneath your healthcare product">
      <div className={styles.page}>
        <PlatformHero />
        {/* The three-tier intro doubles as the section nav — its Apps/Workflows/Foundations
            rows jump to each section, so a separate anchor-link row is redundant. */}
        <PlatformThreeTierIntro />

        <section className={styles.stackedSections}>
          <div className={styles.container}>
            <PlatformApps />
            <PlatformWorkflows />
            <PlatformFoundations />
          </div>
        </section>
      </div>

      <PlatformCta />
    </Layout>
  );
}
