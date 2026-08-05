// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconCheck, IconSearch, IconShieldCheckFilled } from '@tabler/icons-react';
import type { JSX } from 'react';
import styles from './SolutionsPayerIllustration.module.css';

interface PriorAuthRow {
  member: string;
  initials: string;
  service: string;
  submitted: string;
  status: 'Pending' | 'Approved' | 'Denied';
  /** The selected row — its member drives the detail pane on the right. */
  selected?: boolean;
  /** This row's status pill periodically cycles Pending -> Approved to suggest a live queue. */
  animateStatus?: boolean;
}

const ROWS: PriorAuthRow[] = [
  {
    member: 'J. Alvarez',
    initials: 'JA',
    service: 'MRI, Lumbar Spine',
    submitted: 'Today',
    status: 'Pending',
    selected: true,
    animateStatus: true,
  },
  { member: 'K. Nakamura', initials: 'KN', service: 'Physical Therapy ×12', submitted: 'Today', status: 'Approved' },
  { member: 'R. Okafor', initials: 'RO', service: 'CT, Abdomen', submitted: 'Yesterday', status: 'Approved' },
  { member: 'S. Petrov', initials: 'SP', service: 'Outpatient Surgery', submitted: 'Yesterday', status: 'Denied' },
];

const KPIS = [
  { value: '4.2 hrs', label: 'Avg. turnaround' },
  { value: '62%', label: 'Auto-approved' },
  { value: '1,204', label: 'Requests / mo' },
];

const SEGMENTS = ['All', 'Pending', 'Approved'] as const;

export function SolutionsPayerIllustration(): JSX.Element {
  return (
    <div className={styles.mockup} aria-hidden="true">
      {/* Toolbar: title + a status filter, like a real Medplum worklist screen. */}
      <div className={styles.toolbar}>
        <span className={styles.title}>Utilization Management</span>
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
        {/* Left: prior-authorization worklist table. */}
        <div className={styles.list}>
          <div className={styles.table}>
            <div className={`${styles.row} ${styles.headRow}`}>
              <span className={styles.th}>Member</span>
              <span className={styles.th}>Service</span>
              <span className={`${styles.th} ${styles.thRight}`}>Status</span>
            </div>
            {ROWS.map((row) => (
              <div
                key={row.member}
                className={`${styles.row} ${styles.bodyRow} ${row.selected ? styles.rowSelected : ''}`}
              >
                <span className={styles.cellMember}>
                  <span className={styles.avatar}>{row.initials}</span>
                  <span className={styles.memberText}>
                    <span className={styles.memberName}>{row.member}</span>
                    <span className={styles.memberSub}>{row.submitted}</span>
                  </span>
                </span>
                <span className={styles.cellService}>{row.service}</span>
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

        {/* Right: eligibility, coverage, benefit accumulator, and the determination. */}
        <div className={styles.detail}>
          <p className={styles.paneHeading}>Eligibility &amp; Coverage</p>

          <div className={styles.coverageCard}>
            <div className={styles.coverageTop}>
              <span className={styles.shield}>
                <IconShieldCheckFilled size={18} />
              </span>
              <span className={styles.planName}>Regional PPO Gold</span>
              <span className={styles.activeBadge}>Active</span>
            </div>
            <dl className={styles.coverageFields}>
              <div className={styles.field}>
                <dt>Member ID</dt>
                <dd>XJ-004821763</dd>
              </div>
              <div className={styles.field}>
                <dt>Effective</dt>
                <dd>01/01/2026</dd>
              </div>
              <div className={styles.field}>
                <dt>Group</dt>
                <dd>00417-B</dd>
              </div>
              <div className={styles.field}>
                <dt>Relationship</dt>
                <dd>Self</dd>
              </div>
            </dl>
          </div>

          {/* Benefit accumulator — a single-value magnitude meter. */}
          <div className={styles.accumulator}>
            <div className={styles.accumRow}>
              <span className={styles.accumLabel}>Deductible</span>
              <span className={styles.accumValue}>$1,200 / $2,000</span>
            </div>
            <div className={styles.accumTrack}>
              <div className={styles.accumFill} />
            </div>
          </div>

          {/* Determination — tells the automation story for the selected request. */}
          <div className={styles.determination}>
            <span className={styles.determIcon}>
              <IconCheck size={14} stroke={3} />
            </span>
            <span className={styles.determText}>
              Auto-approved &middot; policy rule <span className={styles.determRule}>UM-114</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
