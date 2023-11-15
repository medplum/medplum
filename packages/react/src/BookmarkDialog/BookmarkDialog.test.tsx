import { showNotification } from '@mantine/notifications';
import { UserConfiguration } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { BookmarkDialog } from './BookmarkDialog';

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
    jest.clearAllMocks();
  });

  test('Render not visible', async () => {
    render(
      <MedplumProvider medplum={new MockClient()} navigate={jest.fn()}>
        <BookmarkDialog
          pathname="/"
          searchParams={new URLSearchParams()}
          visible={false}
          onCancel={jest.fn()}
          onOk={jest.fn()}
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
          onCancel={jest.fn()}
          onOk={jest.fn()}
        />
      </MedplumProvider>
    );
    expect(screen.queryAllByPlaceholderText('Bookmark Name')).not.toHaveLength(0);
  });

  test('Render and Submit', async () => {
    const onOk = jest.fn();
    const medplum = new MockClient();

    medplum.getUserConfiguration = jest.fn(() => {
      return getTestUserConfiguration('test-user-config-id');
    });
    render(
      <MedplumProvider medplum={medplum}>
        <BookmarkDialog
          pathname="/"
          searchParams={new URLSearchParams()}
          visible={true}
          onCancel={jest.fn()}
          onOk={onOk}
        />
      </MedplumProvider>
    );
    const input = screen.getByPlaceholderText('Bookmark Name') as HTMLInputElement;

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
    const onOk = jest.fn();
    const onCancel = jest.fn();
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
    const input = screen.getByPlaceholderText('Bookmark Name') as HTMLInputElement;

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
    const onOk = jest.fn();
    const onCancel = jest.fn();
    const medplum = new MockClient();

    medplum.getUserConfiguration = jest.fn(() => {
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
    const menuInput = screen.getByLabelText('Select Menu Option *') as HTMLSelectElement;
    const bookmarkInput = screen.getByPlaceholderText('Bookmark Name') as HTMLInputElement;

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
    const onOk = jest.fn();
    const onCancel = jest.fn();
    const medplum = new MockClient();
    medplum.getUserConfiguration = jest.fn(() => {
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
    const menuInput = screen.getByLabelText('Select Menu Option *') as HTMLSelectElement;
    const bookmarkInput = screen.getByPlaceholderText('Bookmark Name') as HTMLInputElement;

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
