// Customer product clips: each plays only while near the viewport, and stays on its poster frame
// for viewers who prefer reduced motion. The markup uses preload="none", so nothing downloads until
// a clip first plays. Port of CustomerVideo in SolutionsCustomerFeature.tsx.

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function initCustomerVideos(root) {
  const videos = Array.from(root.querySelectorAll('video.solutions-customer-feature-screenshot'));
  if (videos.length === 0) {
    return undefined;
  }

  const inView = new Set();
  const reducedMotion = window.matchMedia(REDUCED_MOTION);

  function update(video) {
    if (inView.has(video) && !reducedMotion.matches) {
      // Playback can still be refused (low power mode, for one), which leaves the poster up.
      // That is the intended fallback, so the rejection is not an error.
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          inView.add(entry.target);
        } else {
          inView.delete(entry.target);
        }
        update(entry.target);
      }
    },
    { rootMargin: '200px 0px' }
  );
  videos.forEach((video) => observer.observe(video));

  const onMotionChange = () => videos.forEach(update);
  reducedMotion.addEventListener('change', onMotionChange);

  return () => {
    observer.disconnect();
    reducedMotion.removeEventListener('change', onMotionChange);
  };
}
