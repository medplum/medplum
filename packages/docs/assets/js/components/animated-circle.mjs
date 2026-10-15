let observer = undefined;

export function initAnimatedCircles() {
  const circles = document.querySelectorAll('.animated-circle-container');
  if (circles.length === 0) {
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const container = entry.target;
          const targetValue = parseInt(container.dataset.value);
          const suffix = container.dataset.suffix;
          const textEl = container.querySelector('.circle-text');

          // 1. Trigger CSS Animation
          container.classList.add('is-visible');

          // 2. Animate the Number (The "Counter" logic)
          let start = null;
          const duration = 2000;

          function step(timestamp) {
            if (!start) {
              start = timestamp;
            }
            const progress = Math.min((timestamp - start) / duration, 1);
            textEl.textContent = Math.floor(progress * targetValue).toLocaleString() + suffix;
            if (progress < 1) {
              window.requestAnimationFrame(step);
            }
          }
          window.requestAnimationFrame(step);
          observer.unobserve(container); // triggerOnce: true
        }
      });
    },
    { threshold: 0.1 }
  );

  circles.forEach((el) => observer.observe(el));
}

export function destroyAnimatedCircles() {
  if (observer) {
    observer.disconnect();
    observer = undefined;
  }
}
