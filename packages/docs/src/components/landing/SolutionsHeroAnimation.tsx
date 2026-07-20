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
// again, on a slow cadence. We have 16 logos for 9 tiles (18 faces), so two backs
// are placeholders rather than repeated logos.
const TILES: { front: Logo; back: Face }[] = [
  { front: { src: '/img/logos/ro.svg', alt: 'Ro' }, back: { src: '/img/logos/thirty-madison.webp', alt: 'Thirty Madison' } },
  { front: { src: '/img/logos/rad-ai.svg', alt: 'Rad AI' }, back: { src: '/img/logos/ultralight.svg', alt: 'Ultralight' } },
  { front: { src: '/img/logos/summer-health.svg', alt: 'Summer Health' }, back: { src: '/img/logos/color.svg', alt: 'Color' } },
  { front: { src: '/img/logos/flexpa.svg', alt: 'Flexpa' }, back: { src: '/img/logos/seen-health.svg', alt: 'Seen Health' } },
  { front: { src: '/img/logos/develo.png', alt: 'Develo' }, back: { src: '/img/logos/quilted-health.svg', alt: 'Quilted Health', fill: true } },
  { front: { src: '/img/logos/everselflogo.png', alt: 'Everself' }, back: { src: '/img/logos/stanford.svg', alt: 'Stanford' } },
  { front: { src: '/img/logos/imagine.svg', alt: 'Imagine Pediatrics' }, back: { src: '/img/logos/remo.svg', alt: 'Remo' } },
  { front: { src: '/img/logos/cdc.svg', alt: 'CDC' }, back: PLACEHOLDER },
  { front: { src: '/img/logos/tia.svg', alt: 'Tia' }, back: PLACEHOLDER },
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

export function SolutionsHeroAnimation(): JSX.Element {
  const { ref, inView } = useInView({ triggerOnce: true, rootMargin: '0px 0px -10% 0px' });

  return (
    <div className={`${styles.canvas} ${inView ? styles.in : ''}`} ref={ref} aria-hidden="true">
      <div className={styles.grid}>
        {TILES.map((tile, i) => (
          <div key={i} className={styles.tile} style={{ animationDelay: `${i * 60}ms` }}>
            <div className={styles.tileInner} style={{ animationDelay: `${2 + i * 0.4}s` }}>
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
