export function initTabs() {
  document.querySelectorAll('.tabs-container').forEach((container) => {
    // Skip if already initialized
    if (container.querySelector('.tabs-button-group')) return;

    const panels = container.querySelectorAll(':scope > .tab-panel');
    if (panels.length === 0) return;

    // Create button group
    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'tabs-button-group';

    panels.forEach((panel, i) => {
      const label = panel.dataset.tabLabel;
      const button = document.createElement('button');
      button.className = 'tabs-button' + (i === 0 ? ' active' : '');
      button.textContent = label;
      button.type = 'button';
      button.addEventListener('click', () => {
        // Deactivate all in this container
        container.querySelectorAll('.tabs-button').forEach((b) => b.classList.remove('active'));
        container.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        // Activate clicked
        button.classList.add('active');
        panel.classList.add('active');
      });
      buttonGroup.appendChild(button);
    });

    container.prepend(buttonGroup);

    // Show first panel
    panels[0].classList.add('active');
  });
}
