// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '../test-utils/render';
import { ModalContentLayout } from './ModalContentLayout';

describe('ModalContentLayout', () => {
  test('Renders children and footer', () => {
    render(
      <ModalContentLayout footer={<button type="button">Save</button>}>
        <div>Body content</div>
      </ModalContentLayout>
    );
    expect(screen.getByText('Body content')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
  });

  test('Renders children before footer in DOM order', () => {
    render(
      <ModalContentLayout footer={<span>Footer</span>}>
        <span>Body</span>
      </ModalContentLayout>
    );
    const body = screen.getByText('Body');
    const footer = screen.getByText('Footer');
    // Node.DOCUMENT_POSITION_FOLLOWING (4) means footer comes after body.
    expect(body.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('Renders both slots when insetContent is set', () => {
    render(
      <ModalContentLayout insetContent footer={<button type="button">Submit</button>}>
        <div>Scrollable body</div>
      </ModalContentLayout>
    );
    expect(screen.getByText('Scrollable body')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDefined();
  });

  test('insetContent scrolls the content rather than the layout', () => {
    render(
      <ModalContentLayout insetContent footer={<span>F</span>}>
        <span>Inset body</span>
      </ModalContentLayout>
    );
    // The content wrapper owns the overflow so the footer can stay pinned.
    const contentWrapper = screen.getByText('Inset body').parentElement as HTMLElement;
    expect(contentWrapper.style.overflowY).toBe('auto');
  });
});
