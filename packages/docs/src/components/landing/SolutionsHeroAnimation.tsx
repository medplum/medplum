// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import clsx from 'clsx';
import type { CSSProperties, JSX } from 'react';
import { useInView } from 'react-intersection-observer';
import styles from './SolutionsHeroAnimation.module.css';

interface Logo {
  readonly src: string;
  readonly alt: string;
  /**
   * Multiplier on the default size caps, for art that sits small in its frame or
   * whose portrait aspect leaves the landscape tile underfilled. Above ~1.19 the
   * logo starts eating into the face's padding, which is intentional headroom.
   */
  readonly scale?: number;
}

// Each tile holds two faces and flips once from front to back, then back again, on a
// slow cadence. Fronts are always customers featured below on the page
// (solutions-content.ts), so the hero matches what the page highlights; backs fill in
// with other real Medplum customers not otherwise featured on /solutions. Keep that
// invariant when editing: nine fronts, nine featured customers. Thirty Madison is
// deliberately excluded from this set (a customer that's since moved off Medplum
// shouldn't be shown as a logo here).
//
// Tile order below is also flip order: the 3-column grid lays these out
// left-to-right/top-to-bottom, and the per-tile animationDelay below increases
// with array index, so the wave sweeps the grid in reading order, then loops.
const TILES: readonly { readonly front: Logo; readonly back: Logo }[] = [
  {
    front: { src: '/img/logos/develo.png', alt: 'Develo' },
    // The file carries a lot of internal whitespace around a two-line lockup, so
    // it renders small against its neighbours at the default caps.
    back: { src: '/img/logos/chamber-cardio.webp', alt: 'Chamber Cardio', scale: 1.15 },
  },
  {
    front: { src: '/img/logos/everselflogo.png', alt: 'Everself' },
    back: { src: '/img/logos/cdc.svg', alt: 'CDC' },
  },
  {
    front: { src: '/img/logos/summer-health.svg', alt: 'Summer Health' },
    back: { src: '/img/logos/ro.svg', alt: 'Ro' },
  },
  {
    front: { src: '/img/logos/pictionhealth.png', alt: 'Pictionhealth' },
    back: { src: '/img/logos/medimind.svg', alt: 'MediMind' },
  },
  {
    front: { src: '/img/logos/ultralight.svg', alt: 'Ultralight' },
    back: { src: '/img/logos/profile-health.svg', alt: 'Profile Health' },
  },
  {
    front: { src: '/img/logos/rad-ai.svg', alt: 'Rad AI' },
    back: { src: '/img/logos/imagine.svg', alt: 'Imagine Pediatrics' },
  },
  {
    front: { src: '/img/logos/color.svg', alt: 'Color' },
    back: { src: '/img/logos/seen-health.svg', alt: 'Seen Health' },
  },
  {
    front: { src: '/img/logos/flexpa.svg', alt: 'Flexpa' },
    back: { src: '/img/logos/quilted-health.svg', alt: 'Quilted Health', scale: 1.45 },
  },
  {
    front: { src: '/img/logos/tia.svg', alt: 'Tia' },
    back: { src: '/img/logos/titan-intake.png', alt: 'Titan Intake' },
  },
];

// One full lap = both halves of the wave: every tile flips to its back face one
// at a time, all of them hold on the back, then every tile flips home again in
// the same order. The `flip` keyframes put the turn home at the 50% mark, so a
// tile's two flips sit exactly half a lap apart no matter how long the lap is.
const FLIP_PERIOD_S = 30;
// How soon the first flip happens after tiles pop in.
const START_DELAY_S = 0.5;
// Gap between neighbouring tiles' flips. Each half-lap has to fit all N flips
// with room to spare, so the last tile lands before the first one turns back:
// the +2 buys that margin (~2s here) instead of finishing exactly on the beat.
const STAGGER_S = FLIP_PERIOD_S / (2 * TILES.length + 2);
// Gap between neighbouring tiles' entrances.
const POP_IN_STAGGER_MS = 60;

function Face({ logo, back }: { readonly logo: Logo; readonly back?: boolean }): JSX.Element {
  return (
    <div className={clsx(styles.face, back && styles.faceBack)}>
      <img
        src={logo.src}
        alt={logo.alt}
        className={styles.logo}
        style={logo.scale ? ({ '--logo-scale': logo.scale } as CSSProperties) : undefined}
        loading="eager"
      />
    </div>
  );
}

export function SolutionsHeroAnimation(): JSX.Element {
  const { ref, inView } = useInView({ triggerOnce: true, rootMargin: '0px 0px -10% 0px' });

  return (
    <div className={clsx(styles.canvas, inView && styles.in)} ref={ref} aria-hidden="true">
      <div className={styles.grid}>
        {TILES.map((tile, i) => (
          <div key={tile.front.src} className={styles.tile} style={{ animationDelay: `${i * POP_IN_STAGGER_MS}ms` }}>
            <div
              className={styles.tileInner}
              style={
                {
                  animationDelay: `${START_DELAY_S + i * STAGGER_S}s`,
                  // Drives the CSS animation's duration, so the period and the
                  // stagger derived from it can't drift apart.
                  '--flip-period': `${FLIP_PERIOD_S}s`,
                } as CSSProperties
              }
            >
              <Face logo={tile.front} />
              <Face logo={tile.back} back />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
