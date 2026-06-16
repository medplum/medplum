// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  IconCalendar,
  IconClipboardList,
  IconHeartHandshake,
  IconMessage,
  IconNotes,
  IconPill,
  IconReceipt,
  IconTestPipe,
} from '@tabler/icons-react';
import type { ComponentType, JSX } from 'react';
import { useState } from 'react';
import { CAPABILITIES } from '../../data/products-content';
import styles from './ProductsCapabilities.module.css';

const CAPABILITY_ICONS: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  IconCalendar,
  IconMessage,
  IconNotes,
  IconTestPipe,
  IconPill,
  IconHeartHandshake,
  IconReceipt,
  IconClipboardList,
};

export function ProductsCapabilities(): JSX.Element {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = CAPABILITIES[activeIdx];

  return (
    <div id="capabilities" className={styles.section}>
      {/* ---- header ---- */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeadline}>Capabilities</h2>
        <p className={styles.sectionLead}>
          Capabilities are what you build on — clinical patterns with the hard parts already solved, backed by first-
          and third-party integrations. Each one ships with pre-built UI components, so you start from working screens
          rather than a blank page. The decision space is mapped, the tradeoffs are documented, and the contracts are
          handled — you make the calls without starting from scratch.
        </p>
      </div>

      {/* ---- Capabilities (the focus of this section) ---- */}
      <div className={styles.subSection}>
        <div className={styles.grid}>
          <ul className={styles.capabilityList}>
            {CAPABILITIES.map((cap, i) => {
              const Icon = CAPABILITY_ICONS[cap.icon];
              const isActive = i === activeIdx;
              return (
                <li key={cap.name}>
                  <button
                    onClick={() => setActiveIdx(i)}
                    className={`${styles.capabilityButton} ${isActive ? styles.capabilityButtonActive : ''}`}
                  >
                    <span className={`${styles.capabilityIcon} ${isActive ? styles.capabilityIconActive : ''}`}>
                      {Icon && <Icon size={18} />}
                    </span>
                    <span className={`${styles.capabilityName} ${isActive ? styles.capabilityNameActive : ''}`}>
                      {cap.name}
                    </span>
                    <span className={`${styles.capabilityShort} ${isActive ? styles.capabilityShortActive : ''}`}>
                      {cap.short}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className={styles.panelWrapper}>
            <div className={styles.screenshotPlaceholder}>
              <div className={styles.placeholderChip}>placeholder</div>
              <div className={styles.placeholderCaption}>{active.name} — pre-built UI</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
