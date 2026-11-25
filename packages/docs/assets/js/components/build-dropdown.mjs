// "Build on the Platform" dropdown (layouts/partials/landing/build-dropdown.html).
// Hover and keyboard focus are handled in CSS; this adds click/tap toggling for touch devices
// and the copy-to-clipboard rows. Uses document-level event delegation, so it needs no
// re-initialization after Swup page transitions.

function setOpen(dropdown, open) {
  dropdown.classList.toggle('is-open', open);
  dropdown.querySelector('.build-dropdown-trigger')?.setAttribute('aria-expanded', String(open));
}

function closeAll(except) {
  document.querySelectorAll('.build-dropdown.is-open').forEach((dropdown) => {
    if (dropdown !== except) {
      setOpen(dropdown, false);
    }
  });
}

async function copy(button) {
  await navigator.clipboard.writeText(button.dataset.copy);

  button.querySelector('.build-dropdown-tooltip')?.remove();
  const tooltip = document.createElement('span');
  tooltip.className = 'build-dropdown-tooltip';
  tooltip.textContent = 'Copied!';
  button.appendChild(tooltip);
  setTimeout(() => tooltip.remove(), 2000);
}

export function initBuildDropdowns() {
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.build-dropdown-trigger');
    if (trigger) {
      const dropdown = trigger.closest('.build-dropdown');
      closeAll(dropdown);
      setOpen(dropdown, !dropdown.classList.contains('is-open'));
      return;
    }

    const copyButton = e.target.closest('.build-dropdown-copy');
    if (copyButton) {
      copy(copyButton).catch(console.error);
      return;
    }

    if (!e.target.closest('.build-dropdown')) {
      closeAll();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAll();
      document.activeElement?.closest('.build-dropdown')?.querySelector('.build-dropdown-trigger')?.blur();
    }
  });
}
