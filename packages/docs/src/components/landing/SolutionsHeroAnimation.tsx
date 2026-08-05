// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { useInView } from 'react-intersection-observer';
import styles from './SolutionsHeroAnimation.module.css';

interface Logo {
  src: string;
  alt: string;
  /** Let a small/portrait logo fill more of its tile than the default caps. */
  fill?: boolean;
}

const PLACEHOLDER = 'placeholder' as const;
type Face = Logo | typeof PLACEHOLDER;

// Each tile holds at most two faces and flips once from front to back, then back
// again, on a slow cadence. Fronts are always customers actually featured below
// on the page (solutions-content.ts), so the hero matches what the page
// highlights; backs fill in with other real Medplum customers not otherwise
// featured on /solutions. Thirty Madison is deliberately excluded from this set
// (a customer that's since moved off Medplum shouldn't be shown as a logo here).
//
// Tile order below is also flip order: the 3-column grid lays these out
// left-to-right/top-to-bottom, and the per-tile animationDelay below increases
// with array index, so the wave sweeps the grid in reading order, then loops.
const TILES: { front: Logo; back: Face }[] = [
  {
    front: { src: '/img/logos/develo.png', alt: 'Develo' },
    back: { src: '/img/logos/tia.svg', alt: 'Tia' },
  },
  {
    front: { src: '/img/logos/everselflogo.png', alt: 'Everself' },
    back: { src: '/img/logos/cdc.svg', alt: 'CDC' },
  },
  {
    front: { src: '/img/logos/summer-health.svg', alt: 'Summer Health' },
    back: { src: '/img/logos/flexpa.svg', alt: 'Flexpa' },
  },
  {
    front: { src: '/img/logos/quilted-health.png', alt: 'Quilted Health' },
    back: { src: '/img/logos/pictionhealth.png', alt: 'Pictionhealth' },
  },
  {
    front: { src: '/img/logos/ultralight.svg', alt: 'Ultralight' },
    back: { src: '/img/logos/remo.svg', alt: 'Remo' },
  },
  {
    front: { src: '/img/logos/rad-ai.svg', alt: 'Rad AI' },
    back: { src: '/img/logos/ro.svg', alt: 'Ro' },
  },
  {
    front: { src: '/img/logos/color.svg', alt: 'Color' },
    back: { src: '/img/logos/seen-health.svg', alt: 'Seen Health' },
  },
  {
    front: { src: '/img/logos/vanna.svg', alt: 'Vanna' },
    back: PLACEHOLDER,
  },
  {
    front: { src: '/img/logos/imagine.svg', alt: 'Imagine Pediatrics' },
    back: PLACEHOLDER,
  },
];

function Face({ face }: { face: Face }): JSX.Element {
  if (face === PLACEHOLDER) {
    return <span className={styles.placeholder}>+ more</span>;
  }
  return (
    <img
      src={face.src}
      alt={face.alt}
      className={styles.logo}
      style={face.fill ? { maxWidth: '94%', maxHeight: '94%' } : undefined}
      loading="eager"
    />
  );
}

// Must match the `flip` keyframe's `animation: flip 20s` in the .module.css.
const FLIP_DURATION_S = 20;
// How soon the first flip happens after tiles pop in.
const START_DELAY_S = 0.5;

export function SolutionsHeroAnimation(): JSX.Element {
  const { ref, inView } = useInView({ triggerOnce: true, rootMargin: '0px 0px -10% 0px' });

  return (
    <div className={`${styles.canvas} ${inView ? styles.in : ''}`} ref={ref} aria-hidden="true">
      <div className={styles.grid}>
        {TILES.map((tile, i) => (
          <div key={i} className={styles.tile} style={{ animationDelay: `${i * 60}ms` }}>
            <div
              className={styles.tileInner}
              style={{ animationDelay: `${START_DELAY_S + i * (FLIP_DURATION_S / TILES.length)}s` }}
            >
              <div className={styles.face}>
                <Face face={tile.front} />
              </div>
              <div className={`${styles.face} ${styles.faceBack}`}>
                <Face face={tile.back} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
