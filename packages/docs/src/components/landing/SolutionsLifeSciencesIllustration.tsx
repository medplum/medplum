// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconCheck, IconClock, IconSearch, IconShieldCheckFilled } from '@tabler/icons-react';
import type { JSX } from 'react';
import styles from './SolutionsLifeSciencesIllustration.module.css';

interface CandidateRow {
  participant: string;
  initials: string;
  criteria: string;
  screened: string;
  status: 'Screening' | 'Eligible' | 'Enrolled' | 'Excluded';
  /** The selected row — its participant drives the detail pane on the right. */
  selected?: boolean;
  /** This row's status pill periodically cycles Screening -> Eligible to suggest a live queue. */
  animateStatus?: boolean;
}

const ROWS: CandidateRow[] = [
  {
    participant: 'A. Whitfield',
    initials: 'AW',
    criteria: 'Meets 8/8 criteria',
    screened: 'Today',
    status: 'Screening',
    selected: true,
    animateStatus: true,
  },
  {
    participant: 'M. Duarte',
    initials: 'MD',
    criteria: 'Meets 7/8 · HbA1c pending',
    screened: 'Today',
    status: 'Screening',
  },
  { participant: 'T. Ibrahim', initials: 'TI', criteria: 'Visit 2 complete', screened: '2d ago', status: 'Enrolled' },
  { participant: 'L. Chen', initials: 'LC', criteria: 'Excluded · eGFR < 45', screened: '2d ago', status: 'Excluded' },
];

const KPIS = [
  { value: '2,413', label: 'Cohort matched' },
  { value: '71%', label: 'Consent complete' },
  { value: '9 days', label: 'Screen to enroll' },
];

const SELECTED = ROWS.find((r) => r.selected) ?? ROWS[0];

/** `source` names the FHIR resource each criterion was screened against. */
const CRITERIA: { label: string; source: string; pending?: boolean }[] = [
  { label: 'Age 40–75', source: 'Patient' },
  { label: 'LVEF ≥ 40%', source: 'Observation' },
  { label: 'Prior MI', source: 'Condition' },
  { label: 'HbA1c < 8.0', source: 'Observation', pending: true },
];

const SEGMENTS = ['All', 'Screening', 'Enrolled'] as const;

export function SolutionsLifeSciencesIllustration(): JSX.Element {
  return (
    <div className={styles.mockup} aria-hidden="true">
      {/* Toolbar: title + a status filter, like a real Medplum worklist screen. */}
      <div className={styles.toolbar}>
        <span className={styles.title}>Trial Recruitment</span>
        <div className={styles.toolbarRight}>
          <div className={styles.segmented}>
            {SEGMENTS.map((seg) => (
              <span key={seg} className={`${styles.segment} ${seg === 'All' ? styles.segmentActive : ''}`}>
                {seg}
              </span>
            ))}
          </div>
          <span className={styles.searchButton}>
            <IconSearch size={14} stroke={2} />
          </span>
        </div>
      </div>

      {/* KPI strip. */}
      <div className={styles.kpis}>
        {KPIS.map((kpi) => (
          <div key={kpi.label} className={styles.kpi}>
            <span className={styles.kpiValue}>{kpi.value}</span>
            <span className={styles.kpiLabel}>{kpi.label}</span>
          </div>
        ))}
      </div>

      <div className={styles.panes}>
        {/* Left: candidate screening worklist, matched against the clinical record. */}
        <div className={styles.list}>
          <div className={styles.table}>
            <div className={`${styles.row} ${styles.headRow}`}>
              <span className={styles.th}>Participant</span>
              <span className={styles.th}>Criteria</span>
              <span className={`${styles.th} ${styles.thRight}`}>Status</span>
            </div>
            {ROWS.map((row) => (
              <div
                key={row.participant}
                className={`${styles.row} ${styles.bodyRow} ${row.selected ? styles.rowSelected : ''}`}
              >
                <span className={styles.cellMember}>
                  <span className={styles.avatar}>{row.initials}</span>
                  <span className={styles.memberText}>
                    <span className={styles.memberName}>{row.participant}</span>
                    <span className={styles.memberSub}>{row.screened}</span>
                  </span>
                </span>
                <span className={styles.cellService}>{row.criteria}</span>
                <span className={styles.cellStatus}>
                  <span
                    className={`${styles.statusPill} ${styles[`status${row.status}`]} ${
                      row.animateStatus ? styles.statusAnimated : ''
                    }`}
                  >
                    {row.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: study enrollment, visit schedule progress, and the consent record. */}
        <div className={styles.detail}>
          {/* Names the selected row, so the two panes read as one list-detail view. */}
          <p className={styles.paneHeading}>Eligibility &middot; {SELECTED.participant}</p>

          <div className={styles.studyCard}>
            <div className={styles.studyTop}>
              <span className={styles.shield}>
                <IconShieldCheckFilled size={18} />
              </span>
              <span className={styles.studyName}>CARDIO-TR2 · Phase III</span>
              <span className={styles.activeBadge}>Active</span>
            </div>
            <div className={styles.criteria}>
              {CRITERIA.map((c) => (
                <div key={c.label} className={styles.criterion}>
                  <span className={`${styles.criterionMark} ${c.pending ? styles.criterionPendingMark : ''}`}>
                    {c.pending ? <IconClock size={10} stroke={3} /> : <IconCheck size={10} stroke={3} />}
                  </span>
                  <span className={`${styles.criterionLabel} ${c.pending ? styles.criterionPendingLabel : ''}`}>
                    {c.label}
                  </span>
                  <span className={styles.criterionSource}>{c.source}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Visit schedule — a single-value magnitude meter, the longitudinal capture story. */}
          <div className={styles.progress}>
            <div className={styles.progressRow}>
              <span className={styles.progressLabel}>Visit schedule</span>
              <span className={styles.progressValue}>4 / 12 complete</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} />
            </div>
          </div>

          {/* Consent record — closes the recruitment -> consent -> capture arc. */}
          <div className={styles.consent}>
            <span className={styles.consentIcon}>
              <IconCheck size={14} stroke={3} />
            </span>
            <span className={styles.consentText}>
              e-Consent signed &middot; version <span className={styles.consentVersion}>2.1</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
