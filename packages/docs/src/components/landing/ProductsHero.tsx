// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import {
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

/* The hero shows the product as an ASSEMBLY: a browser window at the center, ringed by the
   capabilities and foundations it's built from. When scrolled into view the card scales in,
   then the chips stagger out. Foundation chips are the platform primitives; capability chips
   are the pre-built clinical workflows. Without JS, or with prefers-reduced-motion,
   everything renders static (see the CSS fallbacks). */

interface HeroChip {
  id: string;
  label: string;
  kind: 'Capability' | 'Foundation';
  icon: JSX.Element;
  /* Chip centre, as a percentage of the 600×500 stage. */
  left: string;
  top: string;
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
    delay: 0,
  },
  {
    id: 'fhir',
    label: 'FHIR',
    kind: 'Foundation',
    icon: <IconDatabase size={18} stroke={1.75} aria-hidden />,
    left: '85%',
    top: '16.4%',
    delay: 80,
  },
  {
    id: 'billing',
    label: 'Billing',
    kind: 'Capability',
    icon: <IconReceipt size={18} stroke={1.75} aria-hidden />,
    left: '87%',
    top: '45.5%',
    delay: 160,
  },
  {
    id: 'access',
    label: 'Access',
    kind: 'Foundation',
    icon: <IconShieldLock size={18} stroke={1.75} aria-hidden />,
    left: '85%',
    top: '84.5%',
    delay: 240,
  },
  {
    id: 'bots',
    label: 'Bots',
    kind: 'Foundation',
    icon: <IconRobot size={18} stroke={1.75} aria-hidden />,
    left: '50%',
    top: '92.3%',
    delay: 320,
  },
  {
    id: 'charting',
    label: 'Charting',
    kind: 'Capability',
    icon: <IconNotes size={18} stroke={1.75} aria-hidden />,
    left: '17.5%',
    top: '84.5%',
    delay: 400,
  },
  {
    id: 'messaging',
    label: 'Messaging',
    kind: 'Capability',
    icon: <IconMessage size={18} stroke={1.75} aria-hidden />,
    left: '13%',
    top: '48.9%',
    delay: 480,
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    kind: 'Capability',
    icon: <IconCalendar size={18} stroke={1.75} aria-hidden />,
    left: '15%',
    top: '16.4%',
    delay: 560,
  },
];

function HeroAppWindow(): JSX.Element {
  return (
    <div className={styles.heroBrowser}>
      <div className={styles.browserBar}>
        <span className={`${styles.browserDot} ${styles.browserDotRed}`} />
        <span className={`${styles.browserDot} ${styles.browserDotYellow}`} />
        <span className={`${styles.browserDot} ${styles.browserDotGreen}`} />
        <span className={styles.browserAddress}>
          <IconLock size={10} stroke={2} aria-hidden />
          provider.medplum.com
        </span>
      </div>
      <div className={styles.heroBrowserImage}>
        <img
          src="/img/screenshots/product-hero-app.jpg"
          alt="A custom patient app built on Medplum"
          width={1024}
          height={808}
          className={styles.heroScreenshot}
        />
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
      <div className={styles.compCard}>
        <HeroAppWindow />
      </div>

      {/* The chips ride a "wheel" that rotates around the composition centre; each chip
          counter-rotates by the same amount so it orbits like a ferris-wheel car — moving
          around the ring while staying upright (never tilted). */}
      <div className={styles.wheel}>
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
              Book a Demo
            </Link>
            <BuildDropdown />
          </div>
        </div>
        <HeroComposition />
      </div>
    </section>
  );
}
