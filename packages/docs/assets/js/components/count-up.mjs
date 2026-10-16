// Animates numbers from zero to their value when scrolled into view.
// Markup: <div data-count-up="99.99" data-suffix="%">99.99%</div>
// The server-rendered text is the final value, so the stat reads correctly without JS.

const DURATION = 2000;

let observer = undefined;

function render(el, progress) {
  const value = el.dataset.countUp;
  const decimalPlaces = value.includes('.') ? value.split('.')[1].length : 0;
  el.textContent = (progress * parseFloat(value)).toFixed(decimalPlaces) + (el.dataset.suffix ?? '');
}

function animate(el) {
  let start = undefined;

  function step(timestamp) {
    start ??= timestamp;
    const progress = Math.min((timestamp - start) / DURATION, 1);
    render(el, progress);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  }

  window.requestAnimationFrame(step);
}

export function initCountUps() {
  const elements = document.querySelectorAll('[data-count-up]');
  if (elements.length === 0) {
    return;
  }

  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        animate(entry.target);
      }
    });
  });

  elements.forEach((el) => {
    render(el, 0);
    observer.observe(el);
  });
}

export function destroyCountUps() {
  if (observer) {
    observer.disconnect();
    observer = undefined;
  }
}
