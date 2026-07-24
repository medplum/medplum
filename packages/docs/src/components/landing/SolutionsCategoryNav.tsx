// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { SOLUTIONS_CATEGORIES } from '../../data/solutions-content';
import styles from './SolutionsCategoryNav.module.css';

// How far below the navbar a section's top must cross before it counts as "reached".
const SCROLL_THRESHOLD_PX = 120;

function getNavbarHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--ifm-navbar-height');
  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) ? 60 : parsed;
}

function isAtPageBottom(): boolean {
  return window.innerHeight + window.scrollY >= document.body.scrollHeight - 8;
}

export function SolutionsCategoryNav(): JSX.Element {
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(SOLUTIONS_CATEGORIES[0]?.id);
  const [activeCustomerId, setActiveCustomerId] = useState<string | undefined>(undefined);
  const activePillRef = useRef<HTMLAnchorElement | null>(null);

  // Scroll-position-driven active state, rather than relying solely on IntersectionObserver's
  // isIntersecting: that approach never deactivates a stale highlight, never activates the last
  // section if there isn't enough room below it to enter the detection band, and highlights
  // nothing at all before the first scroll. Computing "last section whose top has crossed the
  // threshold line" (plus a bottom-of-page override) fixes all three.
  useEffect(() => {
    let ticking = false;

    const computeActive = (): void => {
      ticking = false;
      const threshold = getNavbarHeight() + SCROLL_THRESHOLD_PX;
      const atBottom = isAtPageBottom();

      let currentCategoryId = SOLUTIONS_CATEGORIES[0]?.id;
      for (const category of SOLUTIONS_CATEGORIES) {
        const section = document.getElementById(category.id);
        if (section && section.getBoundingClientRect().top <= threshold) {
          currentCategoryId = category.id;
        }
      }
      if (atBottom) {
        currentCategoryId = SOLUTIONS_CATEGORIES[SOLUTIONS_CATEGORIES.length - 1]?.id;
      }

      const activeCategory = SOLUTIONS_CATEGORIES.find((category) => category.id === currentCategoryId);
      let currentCustomerId: string | undefined;
      if (activeCategory) {
        for (const customer of activeCategory.customers) {
          const el = document.getElementById(customer.id);
          if (el && el.getBoundingClientRect().top <= threshold) {
            currentCustomerId = customer.id;
          }
        }
        if (atBottom) {
          currentCustomerId = activeCategory.customers[activeCategory.customers.length - 1]?.id;
        }
      }

      setActiveCategoryId(currentCategoryId);
      setActiveCustomerId(currentCustomerId);
    };

    const onScroll = (): void => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(computeActive);
      }
    };

    computeActive();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Mobile: the category bar scrolls horizontally and can overflow, so keep the active
  // pill visible as you scroll the page, rather than leaving it off-screen.
  useEffect(() => {
    activePillRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeCategoryId]);

  return (
    <nav className={styles.nav} aria-label="Solution categories">
      <p className={styles.label}>Explore</p>
      <div className={styles.inner}>
        {SOLUTIONS_CATEGORIES.map((category) => {
          const isActiveCategory = activeCategoryId === category.id;
          return (
            <div key={category.id} className={styles.item}>
              <a
                href={`#${category.id}`}
                ref={isActiveCategory ? activePillRef : undefined}
                className={`${styles.pill} ${isActiveCategory ? styles.pillActive : ''}`}
              >
                {category.title}
              </a>
              {isActiveCategory && category.customers.length > 0 && (
                <div className={styles.subList}>
                  {category.customers.map((customer) => (
                    <a
                      key={customer.id}
                      href={`#${customer.id}`}
                      className={`${styles.subPill} ${activeCustomerId === customer.id ? styles.subPillActive : ''}`}
                    >
                      {customer.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
