// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import {
  IconArrowRight,
  IconCalendar,
  IconDatabase,
  IconLock,
  IconMessage,
  IconNotes,
  IconReceipt,
  IconRobot,
  IconShieldLock,
} from '@tabler/icons-react';
import type { CSSProperties, JSX } from 'react';
import { HERO_HEADLINE, HERO_SUB } from '../../data/products-content';
import { BuildDropdown } from './BuildDropdown';
import styles from './ProductsHero.module.css';

/* The hero shows the product as an ASSEMBLY: a real app card at the center, ringed by the
   capabilities and foundations it's built from. Each chip points by a thin line to roughly
   where that part shows up in the app. When scrolled into view the card scales in, then the
   chips stagger out and their connector lines draw. Foundation chips are the platform
   primitives; capability chips are the pre-built clinical workflows. Without JS, or with
   prefers-reduced-motion, everything renders static (see the CSS fallbacks). */

interface HeroChip {
  id: string;
  label: string;
  kind: 'Capability' | 'Foundation';
  icon: JSX.Element;
  /* Chip centre, as a percentage of the 600×440 stage. */
  left: string;
  top: string;
  /* Connector line in stage units (viewBox 0 0 600 440): start near the chip, end on the card.
     Targets are illustrative, not pixel-accurate to the card's contents. */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  /* Stagger offset for the entrance animation. */
  delay: number;
}

const HERO_CHIPS: HeroChip[] = [
  {
    id: 'auth',
    label: 'Auth',
    kind: 'Foundation',
    icon: <IconLock size={18} stroke={1.75} aria-hidden />,
    left: '50%',
    top: '8.2%',
    sx: 300,
    sy: 58,
    tx: 285,
    ty: 150,
    delay: 0,
  },
  {
    id: 'fhir',
    label: 'FHIR',
    kind: 'Foundation',
    icon: <IconDatabase size={18} stroke={1.75} aria-hidden />,
    left: '85%',
    top: '16.4%',
    sx: 480,
    sy: 92,
    tx: 350,
    ty: 185,
    delay: 80,
  },
  {
    id: 'billing',
    label: 'Billing',
    kind: 'Capability',
    icon: <IconReceipt size={18} stroke={1.75} aria-hidden />,
    left: '87%',
    top: '45.5%',
    sx: 472,
    sy: 205,
    tx: 350,
    ty: 240,
    delay: 160,
  },
  {
    id: 'access',
    label: 'Access',
    kind: 'Foundation',
    icon: <IconShieldLock size={18} stroke={1.75} aria-hidden />,
    left: '85%',
    top: '84.5%',
    sx: 475,
    sy: 356,
    tx: 330,
    ty: 275,
    delay: 240,
  },
  {
    id: 'bots',
    label: 'Bots',
    kind: 'Foundation',
    icon: <IconRobot size={18} stroke={1.75} aria-hidden />,
    left: '50%',
    top: '92.3%',
    sx: 300,
    sy: 388,
    tx: 185,
    ty: 292,
    delay: 320,
  },
  {
    id: 'charting',
    label: 'Charting',
    kind: 'Capability',
    icon: <IconNotes size={18} stroke={1.75} aria-hidden />,
    left: '17.5%',
    top: '84.5%',
    sx: 155,
    sy: 356,
    tx: 225,
    ty: 260,
    delay: 400,
  },
  {
    id: 'messaging',
    label: 'Messaging',
    kind: 'Capability',
    icon: <IconMessage size={18} stroke={1.75} aria-hidden />,
    left: '13%',
    top: '48.9%',
    sx: 128,
    sy: 215,
    tx: 210,
    ty: 255,
    delay: 480,
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    kind: 'Capability',
    icon: <IconCalendar size={18} stroke={1.75} aria-hidden />,
    left: '15%',
    top: '16.4%',
    sx: 120,
    sy: 90,
    tx: 190,
    ty: 228,
    delay: 560,
  },
];

function PatientHeaderCard(): JSX.Element {
  return (
    <div className={styles.patientCard}>
      {/* Browser chrome, so the centre reads as the running app (provider.medplum.com). */}
      <div className={styles.browserBar}>
        <span className={`${styles.browserDot} ${styles.browserDotRed}`} />
        <span className={`${styles.browserDot} ${styles.browserDotYellow}`} />
        <span className={`${styles.browserDot} ${styles.browserDotGreen}`} />
        <div className={styles.browserUrl}>
          <IconLock size={12} stroke={2} aria-hidden />
          provider.medplum.com
        </div>
      </div>
      <div className={styles.patientBody}>
        <div className={styles.patientHeader}>
          <img className={styles.patientAvatar} src="/img/provider/lauren-warner-avatar.webp" alt="Lauren Warner" />
          <div className={styles.patientMeta}>
            <div className={styles.patientName}>Lauren Warner</div>
            <div className={styles.patientMrn}>mrn-44218</div>
          </div>
          <span className={styles.allergyPill}>⚠ Shellfish</span>
        </div>
        <div className={styles.patientFields}>
          <div>
            <div className={styles.fieldLabel}>DOB</div>
            <div className={styles.fieldValue}>Apr 15, 1968</div>
          </div>
          <div>
            <div className={styles.fieldLabel}>Age</div>
            <div className={styles.fieldValue}>58</div>
          </div>
          <div>
            <div className={styles.fieldLabel}>Sex</div>
            <div className={styles.fieldValue}>Female</div>
          </div>
        </div>
        <div className={styles.vitalsBar}>
          <div className={styles.vitalsDot} />
          <div className={styles.vitalsLabel}>Systolic BP</div>
          <div className={styles.vitalsReading}>
            <span className={styles.vitalsValue}>120</span>
            <span className={styles.vitalsMeta}>mmHg · just now</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroComposition(): JSX.Element {
  /* The hero is above the fold, so the entrance plays on load — driven purely by CSS
     animations (the `play` class is always present). That keeps it working with or without
     JS, and prefers-reduced-motion renders everything static via the CSS fallbacks. */
  return (
    <div className={`${styles.composition} ${styles.play}`}>
      {/* Connector lines sit above the card but below the chips, so each line tucks under its
          chip and terminates with a dot on the card. */}
      <svg className={styles.lines} viewBox="0 0 600 440" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {HERO_CHIPS.map((c) => (
          <line
            key={c.id}
            className={styles.line}
            x1={c.sx}
            y1={c.sy}
            x2={c.tx}
            y2={c.ty}
            pathLength={1}
            style={{ '--d': `${c.delay}ms` } as CSSProperties}
          />
        ))}
      </svg>

      <div className={styles.compCard}>
        <PatientHeaderCard />
      </div>

      {HERO_CHIPS.map((c) => (
        <div
          key={c.id}
          className={styles.compChip}
          style={{ left: c.left, top: c.top, '--d': `${c.delay}ms` } as CSSProperties}
        >
          <span className={styles.compIcon}>{c.icon}</span>
          <span className={styles.compChipText}>
            <span className={styles.compChipLabel}>{c.label}</span>
            <span className={styles.compChipSub}>{c.kind}</span>
          </span>
        </div>
      ))}

      {/* TODO: remove before launch — marks the placeholder hero art as not final. */}
      <div className={styles.watermark} aria-hidden="true">
        Reference Image
      </div>
    </div>
  );
}

export function ProductsHero(): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div>
          <h1 className={styles.headline}>{HERO_HEADLINE}</h1>
          <p className={styles.lead}>{HERO_SUB}</p>
          <div className={styles.cta}>
            <Link to="https://cal.com/forms/9da7bfa2-40f5-461d-ad64-33d20bd32a7a" className={styles.primaryButton}>
              Schedule a Demo <IconArrowRight size={16} />
            </Link>
            <BuildDropdown />
          </div>
        </div>
        <HeroComposition />
      </div>
    </section>
  );
}
