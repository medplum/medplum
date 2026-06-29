// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { COMPLIANCE, FOUNDATIONS } from '../../data/products-content';
import { MedplumDiagram, FOUNDATION_NUMBER } from './ProductsDiagram';
import styles from './ProductsFoundations.module.css';

const FOUNDATION_NAMES = FOUNDATIONS.map((f) => f.name);

export function ProductsFoundations(): JSX.Element {
  /* null = resting state: the diagram shows at full strength until the user picks a
     foundation in the diagram. Picking the active one again deselects. */
  const [activeName, setActiveName] = useState<string | null>(null);
  const [peekName, setPeekName] = useState<string | null>(null);
  const active = activeName ? FOUNDATIONS.find((f) => f.name === activeName) : undefined;

  const toggle = (name: string): void => {
    setActiveName((prev) => (prev === name ? null : name));
  };

  const selectFoundation = (name: string): void => {
    setActiveName(name);
  };

  const goNext = (): void => {
    if (!activeName) {
      return;
    }
    const index = FOUNDATION_NAMES.indexOf(activeName);
    if (index === -1) {
      return;
    }
    selectFoundation(FOUNDATION_NAMES[(index + 1) % FOUNDATION_NAMES.length]);
  };

  const goPrev = (): void => {
    if (!activeName) {
      return;
    }
    const index = FOUNDATION_NAMES.indexOf(activeName);
    if (index === -1) {
      return;
    }
    selectFoundation(FOUNDATION_NAMES[(index - 1 + FOUNDATION_NAMES.length) % FOUNDATION_NAMES.length]);
  };

  /* Click anywhere outside a selectable diagram layer or the detail card to exit spotlight. */
  useEffect(() => {
    if (!activeName) {
      return undefined;
    }

    const handleClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('[data-diagram-selectable]')) {
        return;
      }
      if (target.closest('[data-foundation-detail]')) {
        return;
      }
      if (target.closest('[data-foundation-nav]')) {
        return;
      }
      setActiveName(null);
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [activeName]);

  return (
    <div id="foundations" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeadline}>Build on the strongest Foundations in healthcare.</h2>
        <p className={styles.sectionLead}>
          The primitives that make the rest possible—ten building blocks that share one FHIR data model. Every
          Capability and App above relies on these.
        </p>
      </div>

      <div className={styles.detailCard} data-foundation-detail>
        <div className={styles.detailCardMain}>
          {active ? (
            <>
              <div className={styles.detailCardTitleRow}>
                <span className={styles.detailCardNumber} aria-hidden="true">
                  {FOUNDATION_NUMBER[active.name]}
                </span>
                <h3 className={styles.detailCardTitle}>{active.name}</h3>
              </div>
              <p className={styles.detailBody}>{active.body}</p>
            </>
          ) : (
            <p className={styles.detailBody}>
              Select any Foundation in the diagram below to learn more about it.
            </p>
          )}
        </div>
        <div className={styles.detailCardActions}>
          {active ? (
            <>
              <button type="button" className={styles.circleButton} onClick={goPrev} aria-label="Previous foundation">
                <IconChevronLeft size={20} stroke={1.75} aria-hidden />
              </button>
              <button type="button" className={styles.circleButton} onClick={goNext} aria-label="Next foundation">
                <IconChevronRight size={20} stroke={1.75} aria-hidden />
              </button>
            </>
          ) : (
            <div className={styles.foundationNav} data-foundation-nav>
              {FOUNDATIONS.map((foundation) => (
                <button
                  key={foundation.name}
                  type="button"
                  className={`${styles.detailCardNumber} ${styles.foundationNavButton} ${
                    peekName === foundation.name ? styles.foundationNavButtonPeeked : ''
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPeekName(null);
                    selectFoundation(foundation.name);
                  }}
                  onMouseEnter={() => setPeekName(foundation.name)}
                  onMouseLeave={() => setPeekName(null)}
                  onFocus={() => setPeekName(foundation.name)}
                  onBlur={() => setPeekName(null)}
                  aria-label={foundation.name}
                >
                  {FOUNDATION_NUMBER[foundation.name]}
                </button>
              ))}
            </div>
          )}
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
