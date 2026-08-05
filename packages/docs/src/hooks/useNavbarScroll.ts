// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect } from 'react';

/**
 * Matches the home page: the navbar is transparent and shadowless at the top of the page
 * (see `.page .navbar` in custom.css) and only gains its background + shadow once scrolled.
 * Toggles the `onScroll` class on the `.navbar` element based on scroll position.
 */
export function useNavbarScroll(): void {
  useEffect(() => {
    const navbar = document.querySelector('.navbar') as HTMLDivElement | null;
    if (!navbar) {
      return undefined;
    }
    function onScroll(): void {
      if (window.scrollY === 0) {
        navbar?.classList.remove('onScroll');
      } else {
        navbar?.classList.add('onScroll');
      }
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
}
