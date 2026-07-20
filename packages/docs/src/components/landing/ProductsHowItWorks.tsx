// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { IconHelpCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { Badge } from './ComplianceBadges';
import { COMPLIANCE_BADGES, ComplianceBadges } from './ComplianceBadges';
import { ProductsDiagram } from './ProductsDiagram';
import diagramStyles from './ProductsDiagram.module.css';
import styles from './ProductsHowItWorks.module.css';
import { ProductsSectionHeader } from './ProductsSectionHeader';

// Same badges as the home page, but with the plain HITRUST logo (no "e1") and ISO 9001 added.
const PRODUCTS_COMPLIANCE_BADGES: Badge[] = [
  ...COMPLIANCE_BADGES.filter((b) => b.id !== 'epcs').map((b) =>
    b.id === 'hitrust' ? { ...b, label: 'HITRUST', image: '/img/compliance/HITRUST.svg' } : b
  ),
  { id: 'iso-9001', label: 'ISO 9001', image: '/img/compliance/ISO.svg', logoMaxHeight: 54 },
  ...COMPLIANCE_BADGES.filter((b) => b.id === 'epcs'),
];

export function ProductsHowItWorks(): JSX.Element {
  return (
    <div id="howitworks" className={`${styles.section} ${diagramStyles.diagramScale}`}>
      <ProductsSectionHeader headline="How it all works together" leadFullMobile>
        Medplum unifies auth, access control, data, and automation into a single tenant-isolated system for your
        apps—whether built with our components and SDK or forked from our pre-built apps. Medplum Agent connects
        on-prem systems, integrations extend your apps&apos; capabilities, and our compliance and security are built in.
      </ProductsSectionHeader>

      {/* The diagram is a fixed-width figure; below ~1050px it scrolls horizontally within
          its own box so it never forces the whole page to scroll sideways. */}
      <div className={styles.diagramScrollWrap}>
        <div className={styles.diagramScroll}>
          <ProductsDiagram />
        </div>
      </div>

      <hr className={styles.diagramDivider} />

      {/* ---- Certified, Compliant & Secure — styled to match the diagram's section boxes ---- */}
      <div className={styles.complianceCard}>
        <div className={`${diagramStyles.sectionLabel} ${styles.complianceLabel}`}>
          Certified, Compliant &amp; Secure{' '}
          <Link to="/security" aria-label="Learn more about security" className={styles.securityLink}>
            <IconHelpCircle size={16} />
          </Link>
        </div>
        <ComplianceBadges badges={PRODUCTS_COMPLIANCE_BADGES} variant="products" />
      </div>
    </div>
  );
}
