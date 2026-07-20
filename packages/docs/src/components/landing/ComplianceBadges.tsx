// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CSSProperties, JSX } from 'react';
import styles from './ComplianceBadges.module.css';

const SOC2_LOGO = '/img/compliance/soc.png';

export interface Badge {
  id: string;
  label: string;
  image?: string;
  logoMaxHeight?: number;
}

export const COMPLIANCE_BADGES: Badge[] = [
  { id: 'onc', label: 'ONC (+ HTI-4)', image: '/img/compliance/ONC-Certified-HealthIT.png' },
  { id: 'soc2', label: 'SOC 2 Type II' },
  { id: 'hitrust', label: 'HITRUST e1', image: '/img/compliance/hitrust-e1-badge.svg' },
  { id: 'hipaa', label: 'HIPAA', image: '/img/compliance/HIPAA-Asclepius.svg' },
  { id: 'cfr-part-11', label: 'CFR Part 11', image: '/img/compliance/FDA.svg' },
  { id: 'epcs', label: 'EPCS', image: '/img/compliance/drummond-epcs.png' },
];

export function ComplianceBadges({
  badges = COMPLIANCE_BADGES,
  variant = 'default',
}: {
  badges?: Badge[];
  variant?: 'default' | 'products';
}): JSX.Element {
  return (
    <div
      className={`${styles.complianceLogos} ${variant === 'products' ? styles.productsLogos : ''}`}
      style={{ '--compliance-cols': badges.length } as CSSProperties}
    >
      {badges.map((badge) => (
        <div key={badge.id} className={styles.complianceLogoItem}>
          <div className={styles.complianceLogoPlaceholder}>
            <img
              src={badge.image ?? SOC2_LOGO}
              alt={badge.label}
              style={badge.logoMaxHeight ? { maxHeight: badge.logoMaxHeight } : undefined}
            />
          </div>
          <span className={styles.complianceLogoLabel}>{badge.label}</span>
        </div>
      ))}
    </div>
  );
}
