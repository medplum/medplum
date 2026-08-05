// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, TextInput } from '@mantine/core';
import { SubmitButton } from '../Form/SubmitButton';
import { fireEvent, render, screen } from '../test-utils/render';
import { MedplumModal } from './MedplumModal';

describe('MedplumModal', () => {
  test('Renders title, body and actions', () => {
    render(
      <MedplumModal opened onClose={vi.fn()} title="Add Bookmark" actions={<Button>Save</Button>}>
        <div>Body content</div>
      </MedplumModal>
    );
    expect(screen.getByRole('heading', { name: 'Add Bookmark' })).toBeDefined();
    expect(screen.getByText('Body content')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
  });

  test('Renders nothing when closed', () => {
    render(
      <MedplumModal opened={false} onClose={vi.fn()} title="Add Bookmark">
        <div>Body content</div>
      </MedplumModal>
    );
    expect(screen.queryByText('Body content')).toBeNull();
  });

  test('Renders actions after the body', () => {
    render(
      <MedplumModal opened onClose={vi.fn()} title="Add Bookmark" actions={<Button>Save</Button>}>
        <div>Body content</div>
      </MedplumModal>
    );
    const body = screen.getByText('Body content');
    const action = screen.getByRole('button', { name: 'Save' });
    // Node.DOCUMENT_POSITION_FOLLOWING (4) means the action comes after the body.
    expect(body.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('Omits the footer without actions', () => {
    render(
      <MedplumModal opened onClose={vi.fn()} title="Lab Results">
        <div>Body content</div>
      </MedplumModal>
    );
    expect(document.querySelector('.footer')).toBeNull();
    expect(document.querySelector('.scroll')).not.toBeNull();
  });

  test('Applies the layout classes alongside the Mantine classes', () => {
    render(
      <MedplumModal opened onClose={vi.fn()} title="Add Bookmark" actions={<Button>Save</Button>}>
        <div>Body content</div>
      </MedplumModal>
    );
    expect(document.querySelector('.mantine-Modal-content.content')).not.toBeNull();
    expect(document.querySelector('.mantine-Modal-header.header')).not.toBeNull();
    expect(document.querySelector('.mantine-Modal-title.title')).not.toBeNull();
    expect(document.querySelector('.mantine-Modal-body.body')).not.toBeNull();
  });

  test('Merges caller classNames rather than replacing them', () => {
    render(
      <MedplumModal opened onClose={vi.fn()} title="Add Bookmark" classNames={{ body: 'caller-body' }}>
        <div>Body content</div>
      </MedplumModal>
    );
    const body = document.querySelector('.mantine-Modal-body') as HTMLElement;
    expect(body.classList.contains('body')).toBe(true);
    expect(body.classList.contains('caller-body')).toBe(true);
  });

  test('Leaves the styles prop as an escape hatch', () => {
    render(
      <MedplumModal opened onClose={vi.fn()} title="Add Bookmark" styles={{ body: { height: '50vh' } }}>
        <div>Body content</div>
      </MedplumModal>
    );
    const body = document.querySelector('.mantine-Modal-body') as HTMLElement;
    expect(body.style.height).toBe('50vh');
  });

  test('Sets the body height custom property', () => {
    render(
      <MedplumModal opened onClose={vi.fn()} title="Edit Task" bodyHeight="60vh">
        <div>Body content</div>
      </MedplumModal>
    );
    const root = document.querySelector('.mantine-Modal-root') as HTMLElement;
    expect(root.style.getPropertyValue('--medplum-modal-body-height')).toBe('60vh');
  });

  test('Omits the body height custom property by default', () => {
    render(
      <MedplumModal opened onClose={vi.fn()} title="Edit Task">
        <div>Body content</div>
      </MedplumModal>
    );
    const root = document.querySelector('.mantine-Modal-root') as HTMLElement;
    expect(root.style.getPropertyValue('--medplum-modal-body-height')).toBe('');
  });

  test('Submits body fields from an action button', async () => {
    const onSubmit = vi.fn();
    render(
      <MedplumModal
        opened
        onClose={vi.fn()}
        title="Add Bookmark"
        onSubmit={onSubmit}
        actions={<SubmitButton>OK</SubmitButton>}
      >
        <TextInput name="bookmarkname" defaultValue="My bookmark" />
      </MedplumModal>
    );

    // The submit button lives in the footer, so this only passes while the form wraps both slots.
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSubmit).toHaveBeenCalledWith({ bookmarkname: 'My bookmark' });
  });

  test('Renders no form without onSubmit', () => {
    render(
      <MedplumModal opened onClose={vi.fn()} title="Add Bookmark" actions={<Button>Save</Button>}>
        <div>Body content</div>
      </MedplumModal>
    );
    expect(document.querySelector('form')).toBeNull();
  });

  test('Closes from the default close button', () => {
    const onClose = vi.fn();
    render(
      <MedplumModal opened onClose={onClose} title="Add Bookmark">
        <div>Body content</div>
      </MedplumModal>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('Allows overriding the close button props', () => {
    render(
      <MedplumModal opened onClose={vi.fn()} title="Add Bookmark" closeButtonProps={{ 'aria-label': 'Dismiss' }}>
        <div>Body content</div>
      </MedplumModal>
    );
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDefined();
  });

  test('Renders no header without a title or close button', () => {
    render(
      <MedplumModal opened onClose={vi.fn()} withCloseButton={false}>
        <div>Body content</div>
      </MedplumModal>
    );
    expect(document.querySelector('.mantine-Modal-header')).toBeNull();
    expect(screen.getByText('Body content')).toBeDefined();
  });
});
