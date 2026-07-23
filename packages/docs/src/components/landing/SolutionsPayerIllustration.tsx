// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import styles from './SolutionsPayerIllustration.module.css';

interface PriorAuthRow {
  member: string;
  procedure: string;
  status: 'Pending' | 'Approved' | 'Denied';
}

const ROWS: PriorAuthRow[] = [
  { member: 'J. Alvarez', procedure: 'MRI, Lumbar Spine', status: 'Pending' },
  { member: 'K. Nakamura', procedure: 'Physical Therapy, 12 visits', status: 'Approved' },
  { member: 'R. Okafor', procedure: 'CT, Abdomen w/ Contrast', status: 'Approved' },
  { member: 'S. Petrov', procedure: 'Outpatient Surgery', status: 'Denied' },
];

export function SolutionsPayerIllustration(): JSX.Element {
  return (
    <div className={styles.mockup} aria-hidden="true">
      <div className={styles.list}>
        <p className={styles.listHeading}>Prior Authorization Requests</p>
        {ROWS.map((row) => (
          <div key={row.member} className={styles.row}>
            <div className={styles.rowText}>
              <span className={styles.rowMember}>{row.member}</span>
              <span className={styles.rowProcedure}>{row.procedure}</span>
            </div>
            <span className={`${styles.statusPill} ${styles[`status${row.status}`]}`}>{row.status}</span>
          </div>
        ))}
      </div>
      <div className={styles.detail}>
        <p className={styles.detailHeading}>Eligibility &amp; Coverage</p>
        <dl className={styles.detailFields}>
          <div className={styles.detailField}>
            <dt>Plan</dt>
            <dd>Regional PPO Gold</dd>
          </div>
          <div className={styles.detailField}>
            <dt>Member ID</dt>
            <dd>XJ-004821763</dd>
          </div>
          <div className={styles.detailField}>
            <dt>Effective Date</dt>
            <dd>01/01/2026</dd>
          </div>
          <div className={styles.detailField}>
            <dt>Group</dt>
            <dd>00417-B</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
