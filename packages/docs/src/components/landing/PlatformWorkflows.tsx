// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import {
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
  IconSparkles,
  IconTestPipe,
} from '@tabler/icons-react';
import type { ComponentType, JSX } from 'react';
import { useState } from 'react';
import { INTEGRATION_CATEGORIES, WORKFLOWS } from '../../data/platform-content';
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

const SUPPORT_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  IconPrescription,
  IconNetwork,
  IconTestPipe,
  IconReceipt,
  IconFileInvoice,
  IconFileText,
};

export function PlatformWorkflows(): JSX.Element {
  const [activeIdx, setActiveIdx] = useState(0);
  const [aiMode, setAiMode] = useState(false);
  const active = WORKFLOWS[activeIdx];

  return (
    <div id="workflows" className={styles.section}>
      {/* ---- header ---- */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeadline}>Workflows</h2>
        <p className={styles.sectionLead}>
          Workflows are what you build on — clinical patterns with the hard parts already solved, backed by first- and
          third-party integrations. The decision space is mapped. The tradeoffs are documented. The contracts are
          handled. You make the decisions without starting from scratch.
        </p>
      </div>

      {/* ---- Agent-ready: a general principle, not a per-workflow feature ---- */}
      <div className={styles.aiPrinciple}>
        <span className={styles.aiPrincipleIcon} aria-hidden="true">
          <IconSparkles size={18} />
        </span>
        <p className={styles.aiPrincipleText}>
          <strong>Agent-ready:</strong> Medplum supports AI natively — the $ai operation and MCP server let LLMs work
          directly with FHIR. Incorporate agents into any of these workflows, or design with that philosophy in mind.
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
            <div className={styles.panelToggle} role="tablist" aria-label="Workflow view mode">
              <button
                role="tab"
                aria-selected={!aiMode}
                className={`${styles.panelToggleButton} ${!aiMode ? styles.panelToggleButtonActive : ''}`}
                onClick={() => setAiMode(false)}
              >
                Workflow
              </button>
              <button
                role="tab"
                aria-selected={aiMode}
                className={`${styles.panelToggleButton} ${aiMode ? styles.panelToggleButtonActive : ''}`}
                onClick={() => setAiMode(true)}
              >
                <IconSparkles size={15} />
                <span>+ AI</span>
              </button>
            </div>
            <div className={`${styles.screenshotPlaceholder} ${aiMode ? styles.screenshotPlaceholderAi : ''}`}>
              <div className={styles.placeholderChip}>{aiMode ? 'placeholder · AI layer' : 'placeholder'}</div>
              <div className={styles.placeholderCaption}>
                {active.name}
                {aiMode ? ' + AI' : ' — visual'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Supporting layer: integrations slab ---- */}
      <div className={styles.subSection}>
        <div className={styles.supportContainer}>
          <div className={styles.supportColumn}>
            <div className={styles.colHead}>
              <span className={styles.colIcon} aria-hidden="true">
                <IconPlugConnected size={20} />
              </span>
              <div className={styles.colName}>Integrations</div>
            </div>
            <p className={styles.subLead}>
              Pre-built connections across the categories your customers already use — wired to the same datastore.
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
      </div>
    </div>
  );
}
