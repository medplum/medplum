// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import styles from './ComplianceBadges.module.css';

const SOC2_LOGO = '/img/compliance/soc.png';

interface Badge {
  id: string;
  label: string;
  image?: string;
}

const BADGES: Badge[] = [
  { id: 'onc', label: 'ONC (+ HTI-4)', image: '/img/logos/ONC-Certified-HealthIT.png' },
  { id: 'soc2', label: 'SOC 2 Type II' },
  { id: 'hipaa', label: 'HIPAA', image: '/img/logos/HIPAA-Asclepius.svg' },
  { id: 'cfr-part-11', label: 'CFR Part 11', image: '/img/logos/FDA.svg' },
  { id: 'iso-9001', label: 'ISO 9001', image: '/img/logos/ISO.svg' },
  { id: 'epcs', label: 'EPCS', image: '/img/compliance/drummond-epcs.png' },
];

export function ComplianceBadges(): JSX.Element {
  return (
    <div className={styles.complianceLogos}>
      {BADGES.map((badge) => (
        <div key={badge.id} className={styles.complianceLogoItem}>
          <div className={styles.complianceLogoPlaceholder}>
            <img src={badge.image ?? SOC2_LOGO} alt={badge.label} />
          </div>
          <span className={styles.complianceLogoLabel}>{badge.label}</span>
        </div>
      ))}
    </div>
  );
}
