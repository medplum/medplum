// Solutions hero logo grid: starts the tile pop-in and flip animations once the grid scrolls into view.
// Port of SolutionsHeroAnimation.tsx (useInView with triggerOnce); the animations themselves are CSS.

export function initHeroAnimation(root) {
  const canvas = root.querySelector('.solutions-hero-animation-canvas');
  if (!canvas) {
    return undefined;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        canvas.classList.add('solutions-hero-animation-in');
        observer.disconnect();
      }
    },
    { rootMargin: '0px 0px -10% 0px' }
  );
  observer.observe(canvas);
  return () => observer.disconnect();
}
