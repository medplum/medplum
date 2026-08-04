// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider, Modal, createTheme } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { medplumModalTheme } from './modalTheme';

function setup(): ReturnType<typeof render> {
  return render(
    <MantineProvider theme={createTheme({ components: { Modal: medplumModalTheme } })}>
      <Modal opened onClose={() => undefined} title="Example">
        <div>Body content</div>
      </Modal>
    </MantineProvider>
  );
}

describe('medplumModalTheme', () => {
  test('Renders a modal with the themed title', () => {
    setup();
    expect(screen.getByText('Example')).toBeDefined();
    expect(screen.getByText('Body content')).toBeDefined();
  });

  test('Gives the header a bottom border and the title a bold weight', () => {
    setup();
    const header = document.querySelector('.mantine-Modal-header') as HTMLElement;
    const title = document.querySelector('.mantine-Modal-title') as HTMLElement;
    expect(header.style.borderBottom).toContain('light-dark(');
    expect(header.style.flexShrink).toBe('0');
    expect(title.style.fontWeight).toBe('800');
  });

  test('Makes the body the scrolling region so the header stays put', () => {
    setup();
    const content = document.querySelector('.mantine-Modal-content') as HTMLElement;
    const body = document.querySelector('.mantine-Modal-body') as HTMLElement;
    expect(content.style.display).toBe('flex');
    expect(content.style.flexDirection).toBe('column');
    expect(body.style.overflowY).toBe('auto');
    expect(body.style.flexGrow).toBe('1');
  });

  test('Renders a round close button', () => {
    setup();
    const close = document.querySelector('.mantine-Modal-close') as HTMLElement;
    expect(close).toBeDefined();
    expect(close.style.borderRadius).toBe('999px');
  });
});
