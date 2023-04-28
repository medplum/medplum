import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { BookmarkDialog } from './BookmarkDialog';
import { showNotification } from '@mantine/notifications';
import { UserConfiguration } from '@medplum/fhirtypes';

jest.mock('@mantine/notifications');

function getTestUserConfiguration(id: string): UserConfiguration {
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
    (showNotification as unknown as jest.Mock).mockClear();
  });
  test('Render not visible', async () => {
    render(
      <MemoryRouter initialEntries={['/']} initialIndex={0}>
        <MedplumProvider medplum={new MockClient()} navigate={jest.fn()}>
          <BookmarkDialog visible={false} onCancel={jest.fn()} onOk={jest.fn()} />{' '}
        </MedplumProvider>
      </MemoryRouter>
    );
    expect(screen.queryAllByPlaceholderText('bookmark name')).toHaveLength(0);
  });

  test('Render visible', async () => {
    render(
      <MemoryRouter initialEntries={['/']} initialIndex={0}>
        <MedplumProvider medplum={new MockClient()}>
          <BookmarkDialog visible={true} onCancel={jest.fn()} onOk={jest.fn()} />{' '}
        </MedplumProvider>
      </MemoryRouter>
    );
    expect(screen.queryAllByPlaceholderText('bookmark name')).not.toHaveLength(0);
  });

  test('Render and Submit', async () => {
    const onOk = jest.fn();
    const medplum = new MockClient();

    medplum.getUserConfiguration = jest.fn(() => {
      return getTestUserConfiguration('test-user-config-id');
    });
    render(
      <MemoryRouter initialEntries={['/']} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <BookmarkDialog visible={true} onCancel={jest.fn()} onOk={onOk} />
        </MedplumProvider>
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText('bookmark name') as HTMLInputElement;

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(onOk).toHaveBeenCalled();

    expect(screen.queryAllByPlaceholderText('bookmark name')).not.toHaveLength(0);
  });

  test('Render and Cancel', async () => {
    const onOk = jest.fn();
    const onCancel = jest.fn();
    render(
      <MemoryRouter initialEntries={['/']} initialIndex={0}>
        <MedplumProvider medplum={new MockClient()}>
          <BookmarkDialog visible={true} onCancel={onCancel} onOk={onOk} />
        </MedplumProvider>
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText('bookmark name') as HTMLInputElement;

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(onOk).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();

    expect(screen.queryAllByPlaceholderText('bookmark name')).not.toHaveLength(0);
  });

  test('Render and update existing config', async () => {
    const onOk = jest.fn();
    const onCancel = jest.fn();
    const medplum = new MockClient();

    medplum.getUserConfiguration = jest.fn(() => {
      return getTestUserConfiguration('test-user-config-id');
    });

    render(
      <MemoryRouter initialEntries={['/']} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <BookmarkDialog visible={true} onCancel={onCancel} onOk={onOk} />
        </MedplumProvider>
      </MemoryRouter>
    );
    const menuInput = screen.getByPlaceholderText('Menu') as HTMLInputElement;
    const bookmarkInput = screen.getByPlaceholderText('bookmark name') as HTMLInputElement;

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
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(onOk).toHaveBeenCalled();

    expect(screen.getByPlaceholderText('bookmark name')).toBeDefined();
    expect(showNotification).toHaveBeenCalled();
  });

  test('Render and update error for empty id', async () => {
    const onOk = jest.fn();
    const onCancel = jest.fn();
    const medplum = new MockClient();
    medplum.getUserConfiguration = jest.fn(() => {
      return getTestUserConfiguration('');
    });

    render(
      <MemoryRouter initialEntries={['/']} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <BookmarkDialog visible={true} onCancel={onCancel} onOk={onOk} />
        </MedplumProvider>
      </MemoryRouter>
    );
    const menuInput = screen.getByPlaceholderText('Menu') as HTMLInputElement;
    const bookmarkInput = screen.getByPlaceholderText('bookmark name') as HTMLInputElement;

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
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'red',
        message: 'Missing id',
      })
    );
  });
});
