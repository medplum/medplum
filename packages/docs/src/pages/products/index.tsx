// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Layout from '@theme/Layout';
import { type JSX } from 'react';
import { ProductsApps } from '../../components/landing/ProductsApps';
import { ProductsCapabilities } from '../../components/landing/ProductsCapabilities';
import { ProductsCta } from '../../components/landing/ProductsCta';
import { ProductsFoundationsCarousel } from '../../components/landing/ProductsFoundationsCarousel';
import { ProductsHero } from '../../components/landing/ProductsHero';
import { ProductsHowItWorks } from '../../components/landing/ProductsHowItWorks';
import { useNavbarScroll } from '../../hooks/useNavbarScroll';
import styles from './products.module.css';

export default function ProductsPage(): JSX.Element {
  useNavbarScroll();

  return (
    <div className="page">
      <Layout title="Products" description="The platform underneath your healthcare product">
        <div className={styles.page}>
          <ProductsHero />

          <section className={styles.stackedSections}>
            <ProductsApps />
            <div className={styles.container}>
              <ProductsCapabilities />
              <ProductsFoundationsCarousel />
              <ProductsHowItWorks />
            </div>
          </section>
        </div>

        <ProductsCta />
      </Layout>
    </div>
  );
}
