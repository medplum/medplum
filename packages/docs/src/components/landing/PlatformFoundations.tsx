// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { useState } from 'react';
import { COMPLIANCE, FOUNDATIONS } from '../../data/platform-content';
import { MedplumDiagram } from './PlatformDiagram';
import styles from './PlatformFoundations.module.css';

export function PlatformFoundations(): JSX.Element {
  /* null = resting state: the diagram shows at full strength until the user picks a
     foundation (pill or diagram region). Picking the active one again deselects. */
  const [activeName, setActiveName] = useState<string | null>(null);
  const [peekName, setPeekName] = useState<string | null>(null);
  const active = activeName ? FOUNDATIONS.find((f) => f.name === activeName) : undefined;
  const activeIdx = activeName ? FOUNDATIONS.findIndex((f) => f.name === activeName) : -1;

  const toggle = (name: string): void => {
    setActiveName((prev) => (prev === name ? null : name));
  };
  const step = (dir: 1 | -1): void => {
    const next = activeIdx === -1 ? (dir === 1 ? 0 : FOUNDATIONS.length - 1) : (activeIdx + dir + FOUNDATIONS.length) % FOUNDATIONS.length;
    setActiveName(FOUNDATIONS[next].name);
  };

  return (
    <div id="foundations" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeadline}>Foundations</h2>
        <p className={styles.sectionLead}>
          The primitives that make the rest possible — eight building blocks sharing one FHIR data model. Every
          workflow and app above sits on these. Select one to see where it lives in the architecture.
        </p>
      </div>

      {/* ---- numbered index of every foundation; numbers match the diagram badges ---- */}
      <div className={styles.foundationsNav}>
        {FOUNDATIONS.map((f, i) => (
          <button
            key={f.name}
            type="button"
            className={`${styles.navChip} ${f.name === activeName ? styles.navChipActive : ''}`}
            aria-pressed={f.name === activeName}
            onClick={() => toggle(f.name)}
            onMouseEnter={() => setPeekName(f.name)}
            onMouseLeave={() => setPeekName(null)}
            onFocus={() => setPeekName(f.name)}
            onBlur={() => setPeekName(null)}
          >
            <span className={styles.navChipNum}>{i + 1}</span>
            {f.name}
          </button>
        ))}
      </div>

      {/* ---- tracker: description of the selected foundation, with prev/next stepper ---- */}
      <div className={styles.detailPanel}>
        {active ? (
          <div className={styles.detailMeta}>
            <div className={styles.detailNameRow}>
              <span className={styles.detailName}>{active.name}</span>
            </div>
            <p className={styles.detailBody}>{active.body}</p>
          </div>
        ) : (
          <div className={styles.detailMeta}>
            <p className={styles.detailPrompt}>
              Select a foundation — by number above, or directly in the diagram — to read about it. Use the arrows to
              step through all {FOUNDATIONS.length}.
            </p>
          </div>
        )}
        <div className={styles.navButtons}>
          <button className={styles.navButton} onClick={() => step(-1)} aria-label="Previous foundation">
            ←
          </button>
          <button className={styles.navButton} onClick={() => step(1)} aria-label="Next foundation">
            →
          </button>
        </div>
      </div>

      <MedplumDiagram active={activeName} peek={peekName} onSelect={toggle} />

      {/* ---- Compliance & Certification (full-width band, grouped with Foundations) ---- */}
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
  );
}
