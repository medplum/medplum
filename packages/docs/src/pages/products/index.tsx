// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Layout from '@theme/Layout';
import type { JSX } from 'react';
import { useCallback } from 'react';
import { PlatformApps } from '../../components/landing/PlatformApps';
import { PlatformArchitecture } from '../../components/landing/PlatformArchitecture';
import { PlatformCta } from '../../components/landing/PlatformCta';
import { PlatformFoundations } from '../../components/landing/PlatformFoundations';
import { PlatformHero } from '../../components/landing/PlatformHero';
import { PlatformThreeTierIntro } from '../../components/landing/PlatformThreeTierIntro';
import { PlatformWorkflows } from '../../components/landing/PlatformWorkflows';
import styles from './products.module.css';

const SECTION_ANCHORS = [
  { id: 'apps', label: 'Apps' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'foundations', label: 'Foundations' },
];

export default function ProductsPage(): JSX.Element {
  const jumpTo = useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }, []);

  return (
    <Layout title="Products" description="The platform underneath your healthcare product">
      <div className={styles.page}>
        <PlatformHero />
        <PlatformThreeTierIntro />

        <section className={styles.stackedSections}>
          <div className={styles.container}>
            <div className={styles.anchorRow}>
              {SECTION_ANCHORS.map((s) => (
                <a key={s.id} href={`#${s.id}`} className={styles.anchorLink} onClick={(e) => jumpTo(e, s.id)}>
                  {s.label}
                </a>
              ))}
            </div>
            <PlatformApps />
            <PlatformWorkflows />
            <PlatformFoundations />
          </div>
        </section>
      </div>

      <PlatformArchitecture />
      <PlatformCta />
    </Layout>
  );
}
