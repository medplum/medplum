// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '../test-utils/render';
import { ModalActionsFooter } from './ModalActionsFooter';

describe('ModalActionsFooter', () => {
  test('Renders children', () => {
    render(
      <ModalActionsFooter>
        <button type="button">Save</button>
      </ModalActionsFooter>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
  });

  test('Renders multiple actions', () => {
    render(
      <ModalActionsFooter>
        <button type="button">Save</button>
        <button type="button">Cancel</button>
      </ModalActionsFooter>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
  });

  test('Renders a divider by default', () => {
    const { container } = render(
      <ModalActionsFooter>
        <button type="button">Save</button>
      </ModalActionsFooter>
    );
    expect(container.querySelector('.mantine-Divider-root')).not.toBeNull();
  });

  test('Uses a full-bleed top border instead of a divider when sticky', () => {
    const { container } = render(
      <ModalActionsFooter sticky>
        <button type="button">Save</button>
      </ModalActionsFooter>
    );
    // Sticky mirrors the modal header with a border, so the Divider is not used.
    expect(container.querySelector('.mantine-Divider-root')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
  });
});
