// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import {
  IconCalendarEvent,
  IconClipboardList,
  IconDatabase,
  IconMessages,
  IconReceiptDollar,
  IconRobot,
  IconRouter,
  IconSparkles,
} from '@tabler/icons-react';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import { JSX } from 'react';
import { Container } from '../../components/Container';
import { Bento, BentoCell } from '../../components/landing/Bento';
import { Section } from '../../components/landing/Section';
import { SectionHeader } from '../../components/landing/SectionHeader';
import styles from './landing.module.css';

const SDK_SAMPLE = `import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();
await medplum.startClientLogin(id, secret);

// Read any FHIR resource the same way
const patient = await medplum.searchOne('Patient', {
  identifier: 'mrn-12345',
});

// Record a blood pressure reading
await medplum.createResource({
  resourceType: 'Observation',
  status: 'final',
  subject: { reference: \`Patient/\${patient.id}\` },
  code: { text: 'Systolic blood pressure' },
  valueQuantity: { value: 120, unit: 'mmHg' },
});`;

export default function PlatformPage(): JSX.Element {
  return (
    <Layout title="Platform">
      <Container>
        <Section>
          <div className={`${styles.hero} ${styles.heroWithCode}`}>
            <div className={styles.heroText}>
              <div className={styles.heroEyebrow}>Platform</div>
              <h1 className={styles.heroTitle}>Integrated tools and services for healthcare software</h1>
              <p className={styles.heroLead}>
                A platform of integrated, modular products for building secure, compliant healthcare applications.
                Custom EHRs, patient portals, lab systems, and integration hubs on a single FHIR data model. Apache 2.0,
                available managed or self-hosted.
              </p>
              <div className={styles.heroButtons}>
                <Link to="/docs/tutorials" className="button button--primary button--lg">
                  Read the docs
                </Link>
                <Link to="https://github.com/medplum/medplum" className="button button--secondary button--lg">
                  View on GitHub
                </Link>
              </div>
            </div>
            <div className={styles.heroCode}>
              <div className={styles.heroCodeWindow}>
                <div className={styles.heroCodeChrome}>
                  <span className={styles.heroCodeDot} />
                  <span className={styles.heroCodeDot} />
                  <span className={styles.heroCodeDot} />
                  <span className={styles.heroCodeFilename}>medplum-client.ts</span>
                </div>
                <CodeBlock language="typescript" className={styles.heroCodeBlock}>
                  {SDK_SAMPLE}
                </CodeBlock>
              </div>
            </div>
          </div>
        </Section>

        <SectionHeader style={{ marginTop: '3rem', marginBottom: '1.5rem' }}>
          <h2>Capabilities</h2>
          <p>
            Each product is production-ready on its own and connects to the same FHIR data model. Use what you need.
          </p>
        </SectionHeader>
        <Section>
          <Bento>
            <BentoCell
              span={4}
              accent="violet"
              eyebrow="The foundation"
              icon={<IconDatabase />}
              title="Clinical Data Platform"
              description="Your central nervous system for healthcare data. A secure repository and API covering every FHIR R4 resource, with REST, GraphQL, time-aware search, subscriptions, and audit logging built in."
            />
            <BentoCell
              span={2}
              icon={<IconRobot />}
              title="Bots"
              description="Build automated, custom workflows that run inside Medplum. TypeScript functions, triggered by resource changes or HTTP, handling HL7 transforms, eligibility checks, and notifications."
            />
            <BentoCell
              span={2}
              icon={<IconSparkles />}
              title="AI &amp; MCP"
              description="An MCP server exposes FHIR to Claude and other LLM agents through your access policies. The $ai operation provides FHIR-native function calling against OpenAI."
            />
            <BentoCell
              span={2}
              icon={<IconRouter />}
              title="Medplum Agent"
              description="A modern alternative to legacy engines like Mirth. The Agent runs in your local network and tunnels HL7 and DICOM to the cloud over encrypted WebSockets."
            />
            <BentoCell
              span={2}
              icon={<IconClipboardList />}
              title="Questionnaires"
              description="Collect data from patients, clinicians, and staff through custom forms. Built on FHIR Questionnaire with a Google Forms-style builder and drop-in React components."
            />
            <BentoCell
              span={2}
              icon={<IconCalendarEvent />}
              title="Scheduling"
              description="Supports the full range of clinical workflows, from a single practitioner's calendar to multi-location clinics with equipment constraints. Built on FHIR Schedule, Slot, and Appointment."
            />
            <BentoCell
              span={2}
              icon={<IconMessages />}
              title="Communications"
              description="Patient messaging, care-team threads, SMS, email, and async encounters. Threaded around encounters so messages document and bill correctly."
            />
            <BentoCell
              span={2}
              icon={<IconReceiptDollar />}
              title="Billing &amp; RCM"
              description="Charge capture, claims, eligibility, and patient payments built on the FHIR Financial Module — on the same datastore as your clinical data."
            />
          </Bento>
        </Section>

        <SectionHeader style={{ marginTop: '4rem', marginBottom: '1.5rem' }}>
          <h2>How it fits together</h2>
          <p>
            Every capability writes to the same FHIR data model. Bots and the Agent connect inbound; integrations and
            subscriptions push outbound. One source of truth, one set of access controls, one audit log.
          </p>
        </SectionHeader>
        <Section>
          <div className={styles.architectureDiagram}>
            <img src="/img/medplum-overview.svg" alt="Medplum platform architecture overview" />
          </div>
        </Section>

        <Section>
          <div className={styles.platformCta}>
            <div className={styles.platformCtaText}>
              <div className={styles.platformCtaEyebrow}>Get started</div>
              <h2 className={styles.platformCtaTitle}>
                Medplum gives you the infrastructure, the compliance, and the integrations. You ship the product.
              </h2>
              <div className={styles.platformCtaButtons}>
                <Link
                  to="https://cal.com/forms/9da7bfa2-40f5-461d-ad64-33d20bd32a7a"
                  className="button button--primary button--lg"
                >
                  Book a demo
                </Link>
                <Link to="/docs" className="button button--secondary button--lg">
                  Read the docs
                </Link>
                <Link to="/solutions" className="button button--secondary button--lg">
                  See solutions
                </Link>
              </div>
            </div>
            <ul className={styles.platformCtaCreds}>
              <li>
                <span className={styles.credLabel}>License</span>
                <span className={styles.credValue}>Apache 2.0</span>
              </li>
              <li>
                <span className={styles.credLabel}>Compliance</span>
                <span className={styles.credValue}>HIPAA · SOC 2 Type 2</span>
              </li>
              <li>
                <span className={styles.credLabel}>Certified</span>
                <span className={styles.credValue}>ONC (g)(10)</span>
              </li>
              <li>
                <span className={styles.credLabel}>Deployment</span>
                <span className={styles.credValue}>Managed cloud or self-host</span>
              </li>
            </ul>
          </div>
        </Section>
      </Container>
    </Layout>
  );
}
