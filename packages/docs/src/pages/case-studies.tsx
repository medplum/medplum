// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { JSX } from 'react';
import { CardContainer } from '../components/CardContainer';
import { Container } from '../components/Container';
import { ProfileCard } from '../components/ProfileCard';
import { Feature, FeatureGrid } from '../components/landing/FeatureGrid';
import { Jumbotron } from '../components/landing/Jumbotron';
import { Section } from '../components/landing/Section';
import { SectionHeader } from '../components/landing/SectionHeader';
import styles from './about.module.css';

export default function CaseStudiesPage(): JSX.Element {
  return (
    <Layout title="Case Studies">
      <Container>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Case Studies</h1>
            <p className={styles.heroText}>
              Read the details on Medplum implementations with extensive reference materials, documentation and videos.
            </p>
            <img src="/img/hero/hero-custom-apps-and-portals.webp" alt="Custom Apps and Portals" />
          </div>
        </Jumbotron>
        <SectionHeader>
          <h2>Solutions</h2>
        </SectionHeader>
        <Section>
          <FeatureGrid columns={2}>
            <Feature title="AI" imgSrc="/img/icons/code.svg">
              Medplum is a best of breed EHR for integrating AI. Our customers build sophisticated, high-fidelity{' '}
              <Link href="/blog/tags/ai">AI driven applications</Link> on an open source platform with much attention to
              detail.
            </Feature>
            <Feature title="Specialty EHR" imgSrc="/img/icons/clinical-logic.svg">
              Medplum powers many specialty electronic health record systems and other purpose-built healthcare apps.
              Implmentations include solutions across specialties: <Link href="/blog/tags/pediatrics">pediatrics</Link>,
              <Link href="/blog/tags/radiology">radiology</Link>, <Link href="/blog/ensage-case-study">geriatrics</Link>
              , cardiac care and more.
            </Feature>
            <Feature title="Diagnostics" imgSrc="/img/icons/cog-icon.svg">
              Diagnostics providers need highly programmable system that can manage data securely at scale. Medplum
              provides solutions for <Link href="/blog/ro-case-study">laboratory</Link>, medical device, imaging,{' '}
              <Link href="/blog/codex-and-the-power-of-g10">remote patient monitoring</Link> and more.
            </Feature>
            <Feature title="Interop" imgSrc="/img/icons/interoperability.svg">
              Reliable and transparent <Link href="/docs/integration">integrations</Link> are built on Medplum.
              Integrate many systems on the same unified platform. Medplum's{' '}
              <Link href="/docs/bots">bot framework</Link> and{' '}
              <Link href="/docs/auth">industry standard authentication</Link> offering speed up development and ensure
              that integrations really work.
            </Feature>
          </FeatureGrid>
        </Section>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Summer Health</h1>
            <p className={styles.heroText}>
              <Link href="blog/summer-case-study">Pediatric care</Link> 24 hours a day via SMS. Their custom EHR
              features streamlined charting using AI which enhances the experience for patients and clinicians.
            </p>
          </div>
          <div className={styles.heroImage}>
            <iframe
              width="560"
              height="315"
              src="https://www.youtube.com/embed/H2fJVYG8LvQ?si=KIVtT_e-1WE2zzjs"
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        </Jumbotron>
        <Section>
          <CardContainer>
            <ProfileCard
              name="Ro Diagnostics"
              title="Lab, integrations, workflow"
              imgUrl="/img/blog/ro-logo.png"
              webUrl="/blog/ro-case-study"
              youtubeUrl="https://youtu.be/q-22Y7Ox2jY"
            />
            <ProfileCard
              name="Rad AI"
              title="AI, Radiology, interop"
              imgUrl="/img/blog/radai-logo.jpeg"
              webUrl="/blog/radai-case-study"
              youtubeUrl="https://www.youtube.com/watch?v=N5ZocZhdPZ0"
            />
            <ProfileCard
              name="Develo"
              title="Pediatrics, AI, Billing"
              imgUrl="/img/blog/develo.jpeg"
              youtubeUrl="https://www.youtube.com/watch?v=Jk5jSEiBYbQ"
              webUrl="/blog/develo-case-study"
            />
          </CardContainer>
        </Section>
        <Jumbotron>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Rad AI</h1>
            <p className={styles.heroText}>
              <Link href="blog/radai-case-study">Omni Reporting</Link> is an AI powered application that saves time and
              reduces burnout - allowing clinicians to speak less, say more.
            </p>
          </div>
          <div className={styles.heroImage}>
            <iframe
              width="560"
              height="315"
              src="https://www.youtube.com/embed/N5ZocZhdPZ0"
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        </Jumbotron>
        <Section>
          <CardContainer>
            <ProfileCard
              name="Chamber Cardio"
              title="EHR integrations, workflow"
              imgUrl="/img/blog/chamber-cardio-logo.jpeg"
              webUrl="/blog/chamber-cardio-case-study"
              youtubeUrl="https://youtu.be/8bsrKe6VmUs"
            />
            <ProfileCard
              name="Summer Health"
              title="AI, Pediatrics, Messaging"
              imgUrl="/img/blog/summer-health.png"
              webUrl="/blog/summer-case-study"
              youtubeUrl="https://youtu.be/H2fJVYG8LvQ"
            />
            <ProfileCard
              name="Flexpa"
              title="Claims, Billing, Interop"
              imgUrl="/img/blog/flexpa-logo.png"
              youtubeUrl="https://youtu.be/DsdLq6DGi-0"
              webUrl="/blog/flexpa-case-study"
            />
          </CardContainer>
        </Section>
        <Section>
          <CardContainer>
            <ProfileCard
              name="Tia"
              title="Women's health"
              imgUrl="/img/blog/tia-logo.png"
              webUrl="https://concepttocare.substack.com/p/episode-13-ari-saft"
            />
            <ProfileCard
              name="Rewind"
              title="Metabolic health"
              imgUrl="/img/blog/rewind-logo.png"
              webUrl="https://www.vintasoftware.com/work/rewind"
            />
            <ProfileCard
              name="Titan Intake"
              title="AI, scheduling, interop"
              imgUrl="/img/blog/titan-logo.jpeg"
              webUrl="/blog/titan-case-study"
              youtubeUrl="https://youtu.be/sy3YKRFyPII"
            />
          </CardContainer>
        </Section>
      </Container>
    </Layout>
  );
}
