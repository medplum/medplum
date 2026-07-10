// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Layout from '@theme/Layout';
import { useEffect, type JSX } from 'react';
import { ProductsApps } from '../../components/landing/ProductsApps';
import { ProductsCapabilities } from '../../components/landing/ProductsCapabilities';
import { ProductsCta } from '../../components/landing/ProductsCta';
import { ProductsFoundationsCarousel } from '../../components/landing/ProductsFoundationsCarousel';
import { ProductsHero } from '../../components/landing/ProductsHero';
import { ProductsHowItWorks } from '../../components/landing/ProductsHowItWorks';
import styles from './products.module.css';

export default function ProductsPage(): JSX.Element {
  // Match the home page: the navbar is transparent and shadowless at the top of the page
  // (see `.page .navbar` in custom.css) and only gains its background + shadow once scrolled.
  useEffect(() => {
    const navbar = document.querySelector('.navbar') as HTMLDivElement | null;
    if (!navbar) {
      return undefined;
    }
    function onScroll(): void {
      if (window.scrollY === 0) {
        navbar?.classList.remove('onScroll');
      } else {
        navbar?.classList.add('onScroll');
      }
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
