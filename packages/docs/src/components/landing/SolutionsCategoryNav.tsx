// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import clsx from 'clsx';
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

/**
 * Finds the last id in document order whose element has scrolled past the threshold line.
 *
 * @param ids - Anchor ids to consider, in document order.
 * @param threshold - Distance from the top of the viewport that counts as "reached".
 * @returns The reached id, or undefined if none has been reached yet.
 */
function findReachedId(ids: readonly string[], threshold: number): string | undefined {
  let reached: string | undefined;
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element && element.getBoundingClientRect().top <= threshold) {
      reached = id;
    }
  }
  return reached;
}

function lastId(ids: readonly string[]): string | undefined {
  return ids[ids.length - 1];
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
    const categoryIds = SOLUTIONS_CATEGORIES.map((category) => category.id);
    let ticking = false;

    const computeActive = (): void => {
      ticking = false;
      const threshold = getNavbarHeight() + SCROLL_THRESHOLD_PX;
      const atBottom = isAtPageBottom();

      const categoryId = atBottom ? lastId(categoryIds) : (findReachedId(categoryIds, threshold) ?? categoryIds[0]);

      const customerIds =
        SOLUTIONS_CATEGORIES.find((category) => category.id === categoryId)?.customers.map((customer) => customer.id) ??
        [];

      setActiveCategoryId(categoryId);
      setActiveCustomerId(atBottom ? lastId(customerIds) : findReachedId(customerIds, threshold));
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
  // pill visible as you scroll the page, rather than leaving it off-screen. On desktop
  // the sidebar never overflows, so this is a no-op there.
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
                className={clsx(styles.pill, isActiveCategory && styles.pillActive)}
                aria-current={isActiveCategory ? 'true' : undefined}
              >
                {category.title}
              </a>
              {isActiveCategory && category.customers.length > 0 && (
                <div className={styles.subList}>
                  {category.customers.map((customer) => {
                    const isActiveCustomer = activeCustomerId === customer.id;
                    return (
                      <a
                        key={customer.id}
                        href={`#${customer.id}`}
                        className={clsx(styles.subPill, isActiveCustomer && styles.subPillActive)}
                        aria-current={isActiveCustomer ? 'true' : undefined}
                      >
                        {customer.name}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
