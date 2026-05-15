// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import {
  IconArrowRight,
  IconFlask,
  IconHeartRateMonitor,
  IconHospital,
  IconMicroscope,
  IconStethoscope,
  IconTransform,
  IconUserHeart,
} from '@tabler/icons-react';
import { JSX, ReactNode, useState } from 'react';
import styles from './SolutionTabs.module.css';

interface SolutionTab {
  readonly id: string;
  readonly title: string;
  readonly icon: ReactNode;
  readonly eyebrow?: string;
  readonly description: string;
  readonly highlights: readonly ReactNode[];
  readonly startsFrom?: { readonly name: string; readonly href: string };
}

const TABS: readonly SolutionTab[] = [
  {
    id: 'custom-ehr',
    title: 'Custom EHR',
    icon: <IconHeartRateMonitor />,
    eyebrow: 'The most common path',
    description:
      'The primary system your own clinicians use to deliver care. The open source Medplum Provider starter cuts time to build by up to 80% compared to building from scratch.',
    highlights: [
      'Charting & encounter notes',
      'Scheduling & orders',
      'Billing & RCM (FHIR Financial Module)',
      'ONC (g)(10) certification',
    ],
    startsFrom: { name: 'Medplum Provider', href: 'https://github.com/medplum/medplum-provider' },
  },
  {
    id: 'patient-portal',
    title: 'Patient Portal',
    icon: <IconUserHeart />,
    description:
      'A patient-facing application for viewing records, scheduling appointments, messaging providers, and tracking care plans. White-label on your own domain.',
    highlights: [
      'Records, labs, and medications',
      'Self-scheduling',
      'Secure messaging',
      'Care plans & tasks',
      'Intake questionnaires',
    ],
    startsFrom: { name: 'Foo Medical', href: 'https://github.com/medplum/foomedical' },
  },
  {
    id: 'provider-portal',
    title: 'Provider Portal',
    icon: <IconStethoscope />,
    description:
      'A scoped portal for outside clinicians — referring physicians, partner specialists, lab customers — who need limited access to specific patient data, not a full EHR.',
    highlights: [
      'Per-resource access policies',
      'Email and SMS notifications',
      'Patient and record search',
      'Threaded discussion on specific records',
    ],
  },
  {
    id: 'lab-lis',
    title: 'Lab & LIS',
    icon: <IconMicroscope />,
    description:
      'Build an LIS, a lab network, or a diagnostics API. Medplum implementations have been cleared by CLIA/CAP as a primary LIS and power lab-network hubs.',
    highlights: [
      'Order and specimen workflows',
      'HL7 instrument interfaces via the Agent',
      'Result reporting (FHIR + custom PDF)',
      'CLIA/CAP-ready audit logging',
    ],
  },
  {
    id: 'life-sciences',
    title: 'Life Sciences',
    icon: <IconFlask />,
    description:
      'A customizable data management solution for clinical research. A modern, FHIR-native alternative to traditional EDC platforms.',
    highlights: [
      'ePRO and clinical assessments',
      'Lab panel management',
      'EHR data ingestion via HL7 and FHIR',
      'Audit-ready research data',
    ],
  },
  {
    id: 'specialty-clinic',
    title: 'Specialty Clinic',
    icon: <IconHospital />,
    description:
      'Pediatrics, cardiology, radiology, women’s health, and more. Specialty practices need workflows off-the-shelf EHRs don’t model. Customize charting, scheduling, and care plans for how your specialty actually works.',
    highlights: [
      'Specialty-specific charting templates',
      'Care plans and protocols tuned to your specialty',
      'Caregiver and partner access policies',
      'Device and lab integrations',
    ],
  },
  {
    id: 'interoperability',
    title: 'Interoperability',
    icon: <IconTransform />,
    description:
      'Medplum is your central interoperability hub. The Medplum Agent handles on-prem HL7 and DICOM bridging; the platform handles C-CDA, FHIRcast, SFTP, and modern REST. A modern alternative to legacy engines like Mirth and Corepoint.',
    highlights: [
      <>
        HL7 v2 over MLLP via the <Link to="/docs/agent">Medplum Agent</Link>
      </>,
      'C-CDA bidirectional translation',
      'FHIRcast Hub (STU3)',
      'SFTP and REST integrations',
    ],
  },
];

export function SolutionTabs(): JSX.Element {
  const [activeId, setActiveId] = useState<string>(TABS[0].id);
  const active = TABS.find((t) => t.id === activeId) ?? TABS[0];

  return (
    <div className={styles.tabs}>
      <div className={styles.tabList} role="tablist" aria-orientation="vertical">
        {TABS.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => setActiveId(tab.id)}
            >
              <span className={styles.tabIcon}>{tab.icon}</span>
              <span className={styles.tabTitle}>{tab.title}</span>
              {isActive && <IconArrowRight size={16} className={styles.tabIndicator} />}
            </button>
          );
        })}
      </div>

      <div className={styles.panel} role="tabpanel" id={`panel-${active.id}`} aria-labelledby={`tab-${active.id}`}>
        {active.eyebrow && <div className={styles.panelEyebrow}>{active.eyebrow}</div>}
        <div className={styles.panelHeader}>
          <span className={styles.panelIcon}>{active.icon}</span>
          <h3 className={styles.panelTitle}>{active.title}</h3>
        </div>
        <p className={styles.panelDescription}>{active.description}</p>

        <div className={styles.panelHighlights}>
          <div className={styles.panelLabel}>What&apos;s included</div>
          <ul>
            {active.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>

        {active.startsFrom && (
          <div className={styles.panelMeta}>
            <div className={styles.panelMetaItem}>
              <span className={styles.panelLabel}>Open source starter</span>
              <Link to={active.startsFrom.href} className={styles.panelMetaLink}>
                {active.startsFrom.name}
                <IconArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
