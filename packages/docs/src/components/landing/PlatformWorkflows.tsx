// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import {
  IconBook2,
  IconCalendar,
  IconClipboardList,
  IconFileInvoice,
  IconFileText,
  IconHeartHandshake,
  IconMessage,
  IconNetwork,
  IconNotes,
  IconPill,
  IconPlugConnected,
  IconPrescription,
  IconReceipt,
  IconShieldLock,
  IconSparkles,
  IconStack2,
  IconTestPipe,
} from '@tabler/icons-react';
import type { ComponentType, JSX } from 'react';
import { useState } from 'react';
import { COMPLIANCE, INTEGRATION_CATEGORIES, WORKFLOWS } from '../../data/platform-content';
import styles from './PlatformWorkflows.module.css';

const WORKFLOW_ICONS: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  IconCalendar,
  IconMessage,
  IconNotes,
  IconTestPipe,
  IconPill,
  IconHeartHandshake,
  IconReceipt,
  IconClipboardList,
};

interface PlatformFeatureItem {
  name: string;
  icon: string;
  description: string;
  chips?: string[];
}

const PLATFORM_FEATURES: PlatformFeatureItem[] = [
  {
    name: 'User Management, Access & Tenancy',
    icon: 'IconShieldLock',
    description: 'OAuth2, SMART on FHIR, SAML, MFA, granular AccessPolicy, and multi-tenant Projects.',
  },
  {
    name: 'Terminology',
    icon: 'IconBook2',
    description: 'Hosted code systems with licensing and entitlements handled.',
    chips: ['SNOMED', 'LOINC', 'RxNorm', 'ICD-10', 'UMLS'],
  },
  {
    name: 'Agent Ready',
    icon: 'IconSparkles',
    description: '$ai operation + MCP server — LLMs with FHIR context built in.',
  },
];

const SUPPORT_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  IconShieldLock,
  IconBook2,
  IconSparkles,
  IconPrescription,
  IconNetwork,
  IconTestPipe,
  IconReceipt,
  IconFileInvoice,
  IconFileText,
};

export function PlatformWorkflows(): JSX.Element {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = WORKFLOWS[activeIdx];

  return (
    <div id="workflows" className={styles.section}>
      {/* ---- header ---- */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeadline}>Workflows</h2>
        <p className={styles.sectionLead}>
          Workflows are what you build on — clinical patterns with the hard parts already solved, backed by shared
          platform services and integrations. The decision space is mapped. The tradeoffs are documented. The contracts
          are handled. You make the decisions without starting from scratch.
        </p>
      </div>

      {/* ---- Workflows (the focus of this section) ---- */}
      <div className={styles.subSection}>
        <div className={styles.grid}>
          <ul className={styles.capabilityList}>
            {WORKFLOWS.map((wf, i) => {
              const Icon = WORKFLOW_ICONS[wf.icon];
              const isActive = i === activeIdx;
              return (
                <li key={wf.name}>
                  <button
                    onClick={() => setActiveIdx(i)}
                    className={`${styles.capabilityButton} ${isActive ? styles.capabilityButtonActive : ''}`}
                  >
                    <span className={`${styles.capabilityIcon} ${isActive ? styles.capabilityIconActive : ''}`}>
                      {Icon && <Icon size={18} />}
                    </span>
                    <span className={`${styles.capabilityName} ${isActive ? styles.capabilityNameActive : ''}`}>
                      {wf.name}
                    </span>
                    <span className={`${styles.capabilityShort} ${isActive ? styles.capabilityShortActive : ''}`}>
                      {wf.short}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className={styles.panelWrapper}>
            <div className={styles.screenshotPlaceholder}>
              <div className={styles.placeholderChip}>placeholder</div>
              <div className={styles.placeholderCaption}>{active.name} — visual</div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Supporting layer: two columns branching from the workflows ---- */}
      <div className={styles.subSection}>
        <div className={styles.supportContainer}>
         <div className={styles.seamLabel} aria-hidden="true">
           <svg className={styles.seamLabelShape} viewBox="0 0 100 100" preserveAspectRatio="none">
             <polygon
               points="0,0 100,0 100,70 50,100 0,70"
               fill="#fff"
               stroke="var(--oc-grape-4)"
               vectorEffect="non-scaling-stroke"
             />
           </svg>
           <span className={styles.seamLabelText}>Supported by</span>
         </div>
         <div className={styles.supportColumns}>
          {/* Column 1 — Platform Features */}
          <div className={styles.supportColumn}>
            <div className={styles.colHead}>
              <span className={styles.colIcon} aria-hidden="true">
                <IconStack2 size={20} />
              </span>
              <div className={styles.colName}>Platform Features</div>
            </div>
            <p className={styles.subLead}>
              Enterprise-grade infrastructure out of the box — so you're not rebuilding foundational plumbing.
            </p>
            <div className={styles.supportCardList}>
              {PLATFORM_FEATURES.map((f) => {
                const Icon = SUPPORT_ICONS[f.icon];
                return (
                  <div key={f.name} className={styles.supportCard}>
                    <span className={styles.supportCardIcon} aria-hidden="true">
                      {Icon && <Icon size={22} />}
                    </span>
                    <div className={styles.supportCardText}>
                      <div className={styles.supportCardName}>{f.name}</div>
                      <p className={styles.supportCardDesc}>{f.description}</p>
                      {f.chips && (
                        <div className={styles.cardChipRow}>
                          {f.chips.map((c) => (
                            <span key={c} className={styles.cardChip}>
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 2 — Integrations */}
          <div className={styles.supportColumn}>
            <div className={styles.colHead}>
              <span className={styles.colIcon} aria-hidden="true">
                <IconPlugConnected size={20} />
              </span>
              <div className={styles.colName}>Integrations</div>
            </div>
            <p className={styles.subLead}>
              Pre-built connections across the categories your customers already use — wired to the same FHIR datastore.
            </p>
            <div className={styles.supportCardGrid}>
              {INTEGRATION_CATEGORIES.map((cat) => {
                const Icon = SUPPORT_ICONS[cat.icon];
                return (
                  <div key={cat.name} className={styles.supportCard}>
                    <span className={styles.supportCardIcon} aria-hidden="true">
                      {Icon && <Icon size={22} />}
                    </span>
                    <div className={styles.supportCardText}>
                      <div className={styles.supportCardName}>{cat.name}</div>
                      <p className={styles.supportCardDesc}>{cat.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className={styles.integrationsDocsLink}>
              <Link to="/docs/integration">For a comprehensive list of integrations, see the docs →</Link>
            </p>
          </div>
         </div>

         {/* Compliance & Certification — full-width band inside the foundation panel */}
         <div className={styles.complianceBand}>
           <div className={styles.complianceBandHead}>
             <div className={styles.complianceBandTitle}>Compliance &amp; Certification</div>
             <p className={styles.complianceBandLead}>
               Certified for what your customers need today — and what's coming next.
             </p>
           </div>
           <div className={styles.complianceGrid}>
             {COMPLIANCE.map((c) => (
               <div key={c.label} className={styles.complianceCard}>
                 <div className={styles.complianceLogoArea}>
                   {c.img ? <img src={c.img} alt={c.label} className={styles.complianceLogoImg} /> : null}
                 </div>
                 <div>
                   <div className={styles.complianceName}>{c.label}</div>
                   <div className={styles.complianceSub}>{c.sub}</div>
                 </div>
               </div>
             ))}
           </div>
         </div>
        </div>
      </div>
    </div>
  );
}
