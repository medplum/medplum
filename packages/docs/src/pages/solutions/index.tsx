// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { JSX } from 'react';
import { Container } from '../../components/Container';
import { Section } from '../../components/landing/Section';
import { SectionHeader } from '../../components/landing/SectionHeader';
import { SolutionTabs } from '../../components/landing/SolutionTabs';
import platformStyles from '../platform/landing.module.css';
import styles from './solutions.module.css';

export default function SolutionsPage(): JSX.Element {
  return (
    <Layout title="Solutions">
      <Container>
        <Section>
          <div className={platformStyles.hero}>
            <div className={platformStyles.heroText}>
              <div className={platformStyles.heroEyebrow}>Solutions</div>
              <h1 className={platformStyles.heroTitle}>A foundation for healthcare innovation</h1>
              <p className={platformStyles.heroLead}>
                A flexible, secure, and compliant foundation for healthcare applications. Whether you&apos;re building
                a custom EHR, a patient portal, a lab network, or an interoperability hub, Medplum helps you ship in
                months instead of years.
              </p>
            </div>
            <div className={platformStyles.heroImage}>
              <img src="/img/hero/hero-custom-apps-and-portals-square.webp" alt="" />
            </div>
          </div>
        </Section>

        <SectionHeader style={{ marginTop: '3rem', marginBottom: '0.5rem' }}>
          <h2>What teams build on Medplum</h2>
          <p>
            Seven common starting points. Pick the closest to what you&apos;re building &mdash; most customers compose
            two or three.
          </p>
        </SectionHeader>
        <Section>
          <SolutionTabs />
        </Section>

        <div className={styles.ctaBanner}>
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaTitle}>Don&apos;t see your use case?</h2>
            <p className={styles.ctaDescription}>
              Most Medplum customers are building something specific. Talk to our team about your architecture, or
              browse case studies from companies already shipping.
            </p>
            <div className={styles.ctaButtons}>
              <Link
                to="https://cal.com/forms/9da7bfa2-40f5-461d-ad64-33d20bd32a7a"
                className={styles.ctaPrimary}
              >
                Book a demo
              </Link>
              <Link to="/case-studies" className={styles.ctaSecondary}>
                Browse case studies
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </Layout>
  );
}
