// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import type { AppItem } from '../../data/platform-content';
import { FEATURED_APPS } from '../../data/platform-content';
import styles from './PlatformApps.module.css';

function ScreenshotPlaceholder({ caption }: { caption: string }): JSX.Element {
  return (
    <div className={styles.screenshotPlaceholder}>
      <div className={styles.placeholderChip}>placeholder</div>
      <div className={styles.placeholderCaption}>{caption}</div>
    </div>
  );
}

interface AppScreenshot {
  src: string;
  alt: string;
  zoom?: string;
}

function AppHeroImage({ src, alt, zoom }: AppScreenshot): JSX.Element {
  return (
    <div
      className={styles.appHeroContainer}
      role="img"
      aria-label={alt}
      style={{ backgroundImage: `url(${src})`, backgroundSize: zoom ? `${zoom} auto` : undefined }}
    />
  );
}

const APP_SCREENSHOTS: Record<string, AppScreenshot> = {
  provider: {
    src: '/img/provider/medplum-provider-app-cover-image.webp',
    alt: 'Medplum Provider App',
    zoom: '200%',
  },
  admin: {
    src: '/img/screenshots/app.medplum.png',
    alt: 'app.medplum.com — Medplum admin and developer console',
    zoom: '160%',
  },
};

function AppRow({ app, flip }: { app: AppItem; flip: boolean }): JSX.Element {
  const text = (
    <div>
      <h3 className={styles.appName}>{app.name}</h3>
      <div className={styles.appTagline}>{app.tagline}</div>
      <p className={styles.appBody}>{app.body}</p>
    </div>
  );
  const screenshot = APP_SCREENSHOTS[app.id];
  const visual = screenshot ? (
    <AppHeroImage {...screenshot} />
  ) : (
    <ScreenshotPlaceholder caption={`${app.name} — screenshot`} />
  );

  return (
    <div className={`${styles.appRow} ${flip ? styles.appRowFlipped : ''}`}>
      {text}
      {visual}
    </div>
  );
}

export function PlatformApps(): JSX.Element {
  return (
    <div id="apps" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeadline}>Apps</h2>
        <p className={styles.sectionLead}>
          Apps sit at the top of the stack — both your custom apps and the reference implementations that ship with the
          platform. The references below are full working examples: pull from them, learn from them, or use them as the
          foundation for what you're building.
        </p>
      </div>
      <div className={styles.rows}>
        {FEATURED_APPS.map((app, i) => (
          <AppRow key={app.id} app={app} flip={i % 2 === 1} />
        ))}
      </div>
    </div>
  );
}
