// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { BuildDropdown } from './BuildDropdown';
import styles from './ProductsCta.module.css';
import { WindowChrome } from './WindowChrome';

/* Screenshots that cross-fade inside the app window. */
const SLIDES = [
  {
    src: '/img/screenshots/medplum-custom-app-schedule.webp',
    alt: 'A custom scheduling app built on Medplum',
    width: 1024,
    height: 731,
  },
  {
    src: '/img/screenshots/medplum-custom-app-vitals.webp',
    alt: 'A custom patient portal app built on Medplum',
    width: 1024,
    height: 731,
  },
  {
    src: '/img/screenshots/medplum-custom-app-charting.webp',
    alt: 'A custom clinical documentation app built on Medplum',
    width: 1024,
    height: 731,
  },
];
const SLIDE_MS = 1000;

function AppSlideshow(): JSX.Element {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % SLIDES.length);
    }, SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={styles.browserImage}>
      {SLIDES.map((slide, index) => (
        <img
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          width={slide.width}
          height={slide.height}
          className={`${styles.slide}${index === active ? ` ${styles.slideActive}` : ''}`}
          aria-hidden={index !== active}
          loading="lazy"
        />
      ))}
    </div>
  );
}

export function ProductsCta(): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.grid}>
          <div className={styles.copyCol}>
            <h2 className={styles.headline}>Start building your own custom app with Medplum</h2>
            <p className={styles.body}>
              Build and ship your own branded app, for your organization or patients, all running on our FHIR data
              model, auth, and APIs. You own the experience and we&apos;ll handle the infrastructure underneath.
            </p>
            <div className={styles.buttons}>
              <BuildDropdown label="Start Building" triggerClassName={styles.startButton} />
              <Link to="/case-studies" className={styles.whiteButton}>
                View Case Studies
              </Link>
            </div>
          </div>

          <div className={styles.browserCol}>
            <div className={styles.browser}>
              <WindowChrome address="app.yourclinic.com" />
              <AppSlideshow />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
