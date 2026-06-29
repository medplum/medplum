// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Layout from '@theme/Layout';
import type { JSX } from 'react';
import { ProductsApps } from '../../components/landing/ProductsApps';
import { ProductsCapabilities } from '../../components/landing/ProductsCapabilities';
import { ProductsCta } from '../../components/landing/ProductsCta';
import { ProductsFoundations } from '../../components/landing/ProductsFoundations';
import { ProductsHero } from '../../components/landing/ProductsHero';
import styles from './products.module.css';

export default function ProductsPage(): JSX.Element {
  return (
    <Layout title="Products" description="The platform underneath your healthcare product">
      <div className={styles.page}>
        <ProductsHero />

        <section className={styles.stackedSections}>
          <ProductsApps />
          <div className={styles.container}>
            <ProductsCapabilities />
            <ProductsFoundations />
          </div>
        </section>
      </div>

      <ProductsCta />
    </Layout>
  );
}
