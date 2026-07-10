// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconStethoscope, IconTerminal2 } from '@tabler/icons-react';
import clsx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useRef, useState } from 'react';
import type { AppItem } from '../../data/products-content';
import { FEATURED_APPS } from '../../data/products-content';
import styles from './ProductsApps.module.css';

const AUTO_ADVANCE_MS = 5000;

const APP_TAB_ICONS: Record<string, JSX.Element> = {
  provider: <IconStethoscope size={22} stroke={1.75} aria-hidden />,
  admin: <IconTerminal2 size={22} stroke={1.75} aria-hidden />,
};

const APP_SCREENSHOTS: Record<string, { src: string; alt: string }> = {
  provider: {
    src: '/img/provider/medplum-provider-app-cover-image.webp',
    alt: 'Medplum Provider App',
  },
  admin: {
    src: '/img/screenshots/Medplum-App.webp',
    alt: 'Medplum App — admin and developer console',
  },
};

function AppTab({
  app,
  isActive,
  isPaused,
  onSelect,
  onProgressEnd,
}: {
  app: AppItem;
  isActive: boolean;
  isPaused: boolean;
  onSelect: () => void;
  onProgressEnd: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      id={`apps-tab-${app.id}`}
      aria-selected={isActive}
      aria-controls={`apps-panel-${app.id}`}
      className={clsx(styles.tab, isActive && styles.tabActive)}
      onClick={onSelect}
    >
      <span className={styles.tabIcon}>{APP_TAB_ICONS[app.id]}</span>
      <span className={styles.tabLabel}>
        <span className={styles.tabName}>{app.name}</span>
        <span className={styles.tabTagline}>{app.tagline}</span>
      </span>
      {isActive && (
        <span
          // Remount (and restart the timer fill) whenever the active tab changes.
          key={isPaused ? 'paused' : `play-${app.id}`}
          className={clsx(styles.tabProgress, isPaused && styles.tabProgressFull)}
          style={isPaused ? undefined : { animationDuration: `${AUTO_ADVANCE_MS}ms` }}
          onAnimationEnd={isPaused ? undefined : onProgressEnd}
          aria-hidden
        />
      )}
    </button>
  );
}

function StackedScreenshot({
  app,
  isFront,
  isAnimating,
  animToFront,
  animToBack,
  onAnimationEnd,
  onSelect,
}: {
  app: AppItem;
  isFront: boolean;
  isAnimating: boolean;
  animToFront: boolean;
  animToBack: boolean;
  onAnimationEnd: () => void;
  onSelect: () => void;
}): JSX.Element {
  const screenshot = APP_SCREENSHOTS[app.id];
  return (
    <button
      type="button"
      role="tab"
      id={`apps-panel-${app.id}`}
      aria-selected={isFront}
      aria-label={`Switch to ${app.name}`}
      className={clsx(
        styles.stackCard,
        app.id !== FEATURED_APPS[0].id && styles.stackCardAlt,
        !isAnimating && (isFront ? styles.stackFront : styles.stackBack),
        animToFront && styles.animToFront,
        animToBack && styles.animToBack
      )}
      onAnimationEnd={animToFront ? onAnimationEnd : undefined}
      onClick={onSelect}
    >
      <img className={styles.stackImage} src={screenshot.src} alt={screenshot.alt} />
    </button>
  );
}

export function ProductsApps(): JSX.Element {
  const [activeId, setActiveId] = useState<string>(FEATURED_APPS[0].id);
  const [frontId, setFrontId] = useState<string>(FEATURED_APPS[0].id);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const animDoneRef = useRef(false);

  const activeApp = FEATURED_APPS.find((app) => app.id === activeId) ?? FEATURED_APPS[0];

  const goToTab = useCallback(
    (id: string) => {
      if (id === activeId || isAnimating) {
        return;
      }

      setActiveId(id);

      if (id === frontId) {
        return;
      }

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) {
        setFrontId(id);
        return;
      }

      animDoneRef.current = false;
      setIsAnimating(true);
    },
    [activeId, frontId, isAnimating]
  );

  // User interaction: kill the auto-advance timer and lock the selected tab.
  const handleSelect = useCallback(
    (id: string) => {
      setIsPaused(true);
      goToTab(id);
    },
    [goToTab]
  );

  // Timer fill reached the far right — advance to the next tab and loop.
  const handleProgressEnd = useCallback(() => {
    if (isPaused) {
      return;
    }
    const index = FEATURED_APPS.findIndex((app) => app.id === activeId);
    const next = FEATURED_APPS[(index + 1) % FEATURED_APPS.length];
    goToTab(next.id);
  }, [activeId, isPaused, goToTab]);

  const handleAnimationEnd = useCallback(() => {
    if (!isAnimating || animDoneRef.current) {
      return;
    }
    animDoneRef.current = true;
    setFrontId(activeId);
    setIsAnimating(false);
  }, [activeId, isAnimating]);

  return (
    <div id="apps" className={styles.section}>
      <div className={styles.sectionIntro}>
        <h2 className={styles.sectionHeadline}>Start using Medplum today, with our pre-built apps</h2>
        <p className={styles.sectionLead}>
          Developed by Medplum using our powerful capabilities and foundations, these prepackaged apps are ready to be
          modified for your clinical needs—or used as a reference when building your own custom apps.
        </p>
      </div>

      <div className={styles.showcaseWrap}>
        <div className={styles.showcaseBox}>
          <div className={styles.showcaseInner}>
            <div className={styles.tabBar} role="tablist" aria-label="Reference applications">
              {FEATURED_APPS.map((app) => (
                <AppTab
                  key={app.id}
                  app={app}
                  isActive={activeId === app.id}
                  isPaused={isPaused}
                  onSelect={() => handleSelect(app.id)}
                  onProgressEnd={handleProgressEnd}
                />
              ))}
            </div>

            <div className={styles.showcaseBody}>
              <p className={styles.appDescription} key={activeId}>
                {activeApp.body}
              </p>

              <div className={styles.imageStage}>
                <div className={clsx(styles.imageStack, isAnimating && styles.imageStackAnimating)}>
                  {FEATURED_APPS.map((app) => (
                    <StackedScreenshot
                      key={app.id}
                      app={app}
                      isFront={frontId === app.id}
                      isAnimating={isAnimating}
                      animToFront={isAnimating && activeId === app.id && frontId !== app.id}
                      animToBack={isAnimating && frontId === app.id && activeId !== app.id}
                      onAnimationEnd={handleAnimationEnd}
                      onSelect={() => {
                        const other = FEATURED_APPS.find((a) => a.id !== app.id);
                        if (other) handleSelect(other.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
