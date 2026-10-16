// A "copy to clipboard" button on each code block, as on Docusaurus: shown when the block is hovered, and briefly a
// checkmark after copying. Copies the code only (not line numbers), without the trailing newline.

const COPY_ICON =
  '<svg viewBox="0 0 24 24" class="code-copy-icon" aria-hidden="true"><path fill="currentColor" d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"></path></svg>';
const SUCCESS_ICON =
  '<svg viewBox="0 0 24 24" class="code-copy-success-icon" aria-hidden="true"><path fill="currentColor" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"></path></svg>';

function codeText(block) {
  // With line numbers, Chroma renders a table whose last cell has the code
  const code = block.querySelector('.lntd:last-child code') ?? block.querySelector('pre code');
  return (code?.textContent ?? '').replace(/\n$/, '');
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API unavailable (insecure context, older browser): fall back to a selected textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

export function initCopyCode() {
  document.querySelectorAll('.highlight').forEach((block) => {
    if (block.querySelector(':scope > .code-copy-button')) {
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy-button';
    button.title = 'Copy';
    button.setAttribute('aria-label', 'Copy code to clipboard');
    button.innerHTML = COPY_ICON + SUCCESS_ICON;
    let timer;
    button.addEventListener('click', async () => {
      await copy(codeText(block));
      button.classList.add('copied');
      button.setAttribute('aria-label', 'Copied');
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.classList.remove('copied');
        button.setAttribute('aria-label', 'Copy code to clipboard');
      }, 1000);
    });
    block.appendChild(button);
  });
}
