let observer = undefined;

export function initToc() {
  const tocLinks = document.querySelectorAll('#TableOfContents a[href^="#"]');
  if (tocLinks.length === 0) {
    return;
  }

  const headingIds = Array.from(tocLinks).map((link) => link.getAttribute('href').slice(1));
  const headings = headingIds.map((id) => document.getElementById(id)).filter(Boolean);

  if (headings.length === 0) {
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          tocLinks.forEach((link) => link.classList.remove('active'));
          const activeLink = document.querySelector(`#TableOfContents a[href="#${CSS.escape(id)}"]`);
          if (activeLink) {
            activeLink.classList.add('active');
          }
        }
      });
    },
    { rootMargin: '0px 0px -80% 0px' }
  );

  headings.forEach((heading) => observer.observe(heading));
}

export function destroyToc() {
  if (observer) {
    observer.disconnect();
    observer = undefined;
  }
}
