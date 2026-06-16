// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Layout from '@theme/Layout';
import type { JSX } from 'react';
import { ProductsApps } from '../../components/landing/ProductsApps';
import { ProductsCapabilities } from '../../components/landing/ProductsCapabilities';
import { ProductsCta } from '../../components/landing/ProductsCta';
import { ProductsFoundations } from '../../components/landing/ProductsFoundations';
import { ProductsHero } from '../../components/landing/ProductsHero';
import { ProductsThreeTierIntro } from '../../components/landing/ProductsThreeTierIntro';
import styles from './products.module.css';

export default function ProductsPage(): JSX.Element {
  return (
    <Layout title="Products" description="The platform underneath your healthcare product">
      <div className={styles.page}>
        <ProductsHero />
        {/* The three-tier intro doubles as the section nav — its Apps/Capabilities/Foundations
            rows jump to each section, so a separate anchor-link row is redundant. */}
        <ProductsThreeTierIntro />

        <section className={styles.stackedSections}>
          <div className={styles.container}>
            <ProductsApps />
            <ProductsCapabilities />
            <ProductsFoundations />
          </div>
        </section>
      </div>

      <ProductsCta />
    </Layout>
  );
}
