// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { JSX } from 'react';
import { Container } from '../components/Container';
import { FAQGroup, FAQItem } from '../components/landing/FAQ';
import { Section } from '../components/landing/Section';
import { SectionHeader } from '../components/landing/SectionHeader';
import styles from './faq.module.css';

export default function FAQPage(): JSX.Element {
  return (
    <Layout title="FAQ" description="Frequently asked questions about Medplum.">
      <Container>
        <Section>
          <div className={styles.heroFaq}>
            <div className={styles.heroDecoration} aria-hidden="true" />
            <div className={styles.heroText}>
              <div className={styles.heroEyebrow}>Resources</div>
              <h1 className={styles.heroTitle}>Frequently asked questions</h1>
              <p className={styles.heroLead}>
                The questions teams ask before adopting Medplum. Missing something?{' '}
                <Link to="mailto:hello@medplum.com">Email us</Link> or post in{' '}
                <Link to="https://discord.gg/medplum">Discord</Link>.
              </p>
            </div>
          </div>
        </Section>

        <SectionHeader style={{ marginTop: '2rem', marginBottom: '1rem' }}>
          <p>
            Looking for technical reference? See the <Link to="/docs">Docs</Link>. Looking for pricing? See{' '}
            <Link to="/pricing">Pricing</Link>.
          </p>
        </SectionHeader>

        <Section>
          <FAQGroup title="Platform & technology">
            <FAQItem question="What is Medplum?">
              <p>
                Medplum is an open source, FHIR-native platform for building healthcare software. It includes a data
                store, REST and GraphQL APIs, a serverless functions framework (Bots), an on-prem agent for HL7 and
                DICOM, and React components for building portals and EHRs. The same codebase runs on our managed cloud
                or your own infrastructure.
              </p>
            </FAQItem>
            <FAQItem question="Is Medplum a complete EHR?">
              <p>
                Not by itself. Medplum is the platform underneath custom EHRs. Our open source{' '}
                <Link to="https://github.com/medplum/medplum-provider">Medplum Provider</Link> starter is a working EHR
                application that customers fork and customize. Most teams ship a production EHR on top of it in three to
                six months.
              </p>
            </FAQItem>
            <FAQItem question="What programming languages does Medplum support?">
              <p>
                Bots are written in TypeScript. The official SDK is TypeScript, plus a Node-based CLI for scripting and
                deployment. The REST and GraphQL APIs work from any language. For UI work, the{' '}
                <code>@medplum/react</code> component library &mdash; questionnaire forms, patient timelines, resource
                tables, scheduling pickers, and more &mdash; is documented on{' '}
                <Link to="https://storybook.medplum.com">Storybook</Link>.
              </p>
            </FAQItem>
            <FAQItem question="How does Medplum compare to Mirth Connect?">
              <p>
                Medplum Agent + Bots replaces Mirth for HL7 integration with a cloud-native architecture, TypeScript
                transforms instead of XML config, and continuous security maintenance. See our{' '}
                <Link to="/blog/medplum-for-mirth-users">full comparison for Mirth users</Link>.
              </p>
            </FAQItem>
            <FAQItem question="Can I migrate data from another system?">
              <p>
                Yes. Most customers migrate from a combination of EHRs, custom databases, and one-off exports. We
                support bulk FHIR import, HL7 ingestion, and arbitrary transforms via Bots. Talk to us about your source
                systems and we&apos;ll point you at the right path.
              </p>
            </FAQItem>
          </FAQGroup>

          <FAQGroup title="Pricing & plans">
            <FAQItem question="Is Medplum free?">
              <p>
                The open source Medplum platform is free under the Apache 2.0 license &mdash; you can self-host on your
                own infrastructure indefinitely. The managed cloud is free for development and prototyping; production
                usage is billed per project. See <Link to="/pricing">Pricing</Link>.
              </p>
            </FAQItem>
            <FAQItem question="Do you offer enterprise support?">
              <p>
                Yes. Enterprise plans include dedicated infrastructure, custom SLAs, and onboarding support.{' '}
                <Link to="https://cal.com/forms/9da7bfa2-40f5-461d-ad64-33d20bd32a7a">Contact sales</Link> to scope it.
              </p>
            </FAQItem>
            <FAQItem question="What's included with the managed cloud?">
              <p>
                The managed cloud handles infrastructure, scaling, backups, patching, security monitoring, and
                compliance audits. You get the same APIs and codebase as self-hosted, without operating the
                infrastructure. BAAs are signed on production plans.
              </p>
            </FAQItem>
          </FAQGroup>

          <FAQGroup title="Compliance & security">
            <FAQItem question="Is Medplum HIPAA compliant?">
              <p>
                Yes. The managed cloud is HIPAA-aligned and we sign BAAs on paid plans. Self-hosted deployments inherit
                HIPAA controls when configured per our <Link to="/docs/compliance">compliance guide</Link>.
              </p>
            </FAQItem>
            <FAQItem question="What certifications does Medplum hold?">
              <p>
                HIPAA, SOC 2 Type II, ONC (g)(10) API certification (including HTI-4), CFR Part 11 (for clinical
                research), ISO 9001, and EPCS (Drummond-certified). Full audit details and posture are in the{' '}
                <Link to="/docs/compliance">compliance portal</Link>.
              </p>
            </FAQItem>
            <FAQItem question="Where is patient data stored?">
              <p>
                On the managed cloud, data is stored in AWS, encrypted at rest and in transit. Customers with data
                residency requirements (EU, Canada, other regions) can request alternative deployment regions on
                enterprise plans. Self-hosted customers retain full control over data location.
              </p>
            </FAQItem>
            <FAQItem question="How are bots and integrations audited?">
              <p>
                Every API call, every resource mutation, and every bot execution is captured as a FHIR{' '}
                <code>AuditEvent</code>. Logs are queryable through the same search API as clinical data and retained
                per your plan&apos;s retention policy.
              </p>
            </FAQItem>
          </FAQGroup>

          <FAQGroup title="Open source">
            <FAQItem question="Is Medplum really open source?">
              <p>
                Yes. The entire platform &mdash; server, agent, SDK, React components, and reference applications
                &mdash; is Apache 2.0 licensed and developed publicly on{' '}
                <Link to="https://github.com/medplum/medplum">GitHub</Link>. There is no proprietary core.
              </p>
            </FAQItem>
            <FAQItem question="What's the difference between the managed cloud and self-hosted?">
              <p>
                Same code, different operator. The managed cloud is run by Medplum &mdash; compliance, scaling, backups,
                and upgrades included. Self-hosted is operated by your team, typically on AWS, GCP, or Azure. Both
                expose identical APIs. Customers can start on the managed cloud and move to self-hosted later (or vice
                versa).
              </p>
            </FAQItem>
            <FAQItem question="Can I contribute?">
              <p>
                Absolutely. Bug fixes, features, docs, and Bots are all welcome contributions. Start with the{' '}
                <Link to="/docs/contributing">contributing guide</Link>, then jump in on{' '}
                <Link to="https://github.com/medplum/medplum/issues">GitHub issues</Link> or{' '}
                <Link to="https://discord.gg/medplum">Discord</Link>.
              </p>
            </FAQItem>
          </FAQGroup>

          <FAQGroup title="Implementation & support">
            <FAQItem question="How long does it take to get started?">
              <p>
                A working prototype on the managed cloud takes about an hour: create an account, install the SDK, write
                your first FHIR resource. A production EHR shipping to real users typically takes three to six months
                from initial commit. The <Link to="/docs/tutorials">quickstart</Link> walks through the first hour.
              </p>
            </FAQItem>
            <FAQItem question="Do you offer professional services?">
              <p>
                Medplum doesn&apos;t take on paid implementation work directly. Customers typically build with their own
                engineering teams or work with consulting partners. <Link to="mailto:hello@medplum.com">Email us</Link>{' '}
                if you&apos;d like a recommendation.
              </p>
            </FAQItem>
            <FAQItem question="Who actually uses Medplum in production?">
              <p>
                Companies like Ro, Develo, Summer Health, Ensage, Chamber Cardio, Rad AI, Flexpa, Lumba Health, Titan
                Intake, and Kit.com. See <Link to="/case-studies">case studies</Link> for the deep dives.
              </p>
            </FAQItem>
          </FAQGroup>
        </Section>
      </Container>
    </Layout>
  );
}
