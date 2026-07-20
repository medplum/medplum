// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { SOLUTIONS_CATEGORIES } from '../../data/solutions-content';
import styles from './SolutionsCategoryNav.module.css';

export function SolutionsCategoryNav(): JSX.Element {
  const [activeId, setActiveId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      // A narrow band near the top of the viewport: the section crossing it is "active".
      { rootMargin: '-20% 0px -70% 0px' }
    );
    for (const category of SOLUTIONS_CATEGORIES) {
      const section = document.getElementById(category.id);
      if (section) {
        observer.observe(section);
      }
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav className={styles.nav} aria-label="Solution categories">
      <p className={styles.label}>Explore</p>
      <div className={styles.inner}>
        {SOLUTIONS_CATEGORIES.map((category) => (
          <a
            key={category.id}
            href={`#${category.id}`}
            className={`${styles.pill} ${activeId === category.id ? styles.pillActive : ''}`}
          >
            {category.title}
          </a>
        ))}
      </div>
    </nav>
  );
}
