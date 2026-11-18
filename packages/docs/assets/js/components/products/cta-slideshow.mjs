// Closing CTA: cross-fades the custom app screenshots inside the browser window.
// Port of AppSlideshow in ProductsCta.tsx.

const SLIDE_MS = 1000;
const C = 'products-cta-';

export function initCtaSlideshow(root) {
  const slides = Array.from(root.querySelectorAll(`.${C}browser-image .${C}slide`));
  if (slides.length < 2) {
    return undefined;
  }

  let active = 0;
  const timer = setInterval(() => {
    active = (active + 1) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle(`${C}slide-active`, i === active);
      slide.setAttribute('aria-hidden', String(i !== active));
    });
  }, SLIDE_MS);

  return () => clearInterval(timer);
}
