// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { UserConfiguration } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { BookmarkDialog } from './BookmarkDialog';

vi.mock('@mantine/notifications');

function getTestUserConfiguration(id: string): WithId<UserConfiguration> {
  return {
    id,
    resourceType: 'UserConfiguration',
    menu: [
      {
        title: 'Favorites',
        link: [
          { name: 'Patients', target: '/Patient' },
          { name: 'Active Orders', target: '/ServiceRequest?status=active' },
          { name: 'Completed Orders', target: '/ServiceRequest?status=completed' },
        ],
      },
      {
        title: 'Admin',
        link: [
          { name: 'Project', target: '/admin/project' },
          { name: 'Batch', target: '/batch' },
        ],
      },
    ],
  };
}

describe('BookmarkDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('Render not visible', async () => {
    render(
      <MedplumProvider medplum={new MockClient()} navigate={vi.fn()}>
        <BookmarkDialog
          pathname="/"
          searchParams={new URLSearchParams()}
          visible={false}
          onCancel={vi.fn()}
          onOk={vi.fn()}
        />
      </MedplumProvider>
    );
    expect(screen.queryAllByPlaceholderText('Bookmark Name')).toHaveLength(0);
  });

  test('Render visible', async () => {
    render(
      <MedplumProvider medplum={new MockClient()}>
        <BookmarkDialog
          pathname="/"
          searchParams={new URLSearchParams()}
          visible={true}
          onCancel={vi.fn()}
          onOk={vi.fn()}
        />
      </MedplumProvider>
    );
    expect(screen.queryAllByPlaceholderText('Bookmark Name')).not.toHaveLength(0);
  });

  test('Render and Submit', async () => {
    const onOk = vi.fn();
    const medplum = new MockClient();

    medplum.getUserConfiguration = vi.fn(() => {
      return getTestUserConfiguration('test-user-config-id');
    });
    render(
      <MedplumProvider medplum={medplum}>
        <BookmarkDialog
          pathname="/"
          searchParams={new URLSearchParams()}
          visible={true}
          onCancel={vi.fn()}
          onOk={onOk}
        />
      </MedplumProvider>
    );
    const input = screen.getByPlaceholderText('Bookmark Name');

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    });
    expect(onOk).toHaveBeenCalled();

    expect(screen.queryAllByPlaceholderText('Bookmark Name')).not.toHaveLength(0);
  });

  test('Render and Cancel', async () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();
    render(
      <MedplumProvider medplum={new MockClient()}>
        <BookmarkDialog
          pathname="/"
          searchParams={new URLSearchParams()}
          visible={true}
          onCancel={onCancel}
          onOk={onOk}
        />
      </MedplumProvider>
    );
    const input = screen.getByPlaceholderText('Bookmark Name');

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(onOk).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();

    expect(screen.queryAllByPlaceholderText('Bookmark Name')).not.toHaveLength(0);
  });

  test('Render and update existing config', async () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();
    const medplum = new MockClient();

    medplum.getUserConfiguration = vi.fn(() => {
      return getTestUserConfiguration('test-user-config-id');
    });

    render(
      <MedplumProvider medplum={medplum}>
        <BookmarkDialog
          pathname="/"
          searchParams={new URLSearchParams()}
          visible={true}
          onCancel={onCancel}
          onOk={onOk}
        />
      </MedplumProvider>
    );
    const menuInput = screen.getByLabelText('Select Menu Option *');
    const bookmarkInput = screen.getByPlaceholderText('Bookmark Name');

    await act(async () => {
      fireEvent.focus(menuInput);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(menuInput, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(menuInput, { key: 'Enter', code: 'Enter' });
    });

    // Enter random text
    await act(async () => {
      fireEvent.change(bookmarkInput, { target: { value: 'Test' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    });
    expect(onOk).toHaveBeenCalled();

    expect(screen.getByPlaceholderText('Bookmark Name')).toBeDefined();
    expect(showNotification).toHaveBeenCalled();
  });

  test('Render and update error for empty id', async () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();
    const medplum = new MockClient();
    medplum.getUserConfiguration = vi.fn(() => {
      return getTestUserConfiguration('');
    });

    render(
      <MedplumProvider medplum={medplum}>
        <BookmarkDialog
          pathname="/"
          searchParams={new URLSearchParams()}
          visible={true}
          onCancel={onCancel}
          onOk={onOk}
        />
      </MedplumProvider>
    );
    const menuInput = screen.getByLabelText('Select Menu Option *');
    const bookmarkInput = screen.getByPlaceholderText('Bookmark Name');

    await act(async () => {
      fireEvent.focus(menuInput);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(menuInput, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(menuInput, { key: 'Enter', code: 'Enter' });
    });

    // Enter random text
    await act(async () => {
      fireEvent.change(bookmarkInput, { target: { value: 'Test' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    });

    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'red',
        message: 'Missing id',
      })
    );
  });
});
