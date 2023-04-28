import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { BookmarkDialog } from './BookmarkDialog';

const medplum = new MockClient();

describe('BookmarkDialog', () => {
  test('Render not visible', () => {
    render(
      <MemoryRouter initialEntries={['/']} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <BookmarkDialog visible={false} onCancel={jest.fn()} onOk={jest.fn()} />{' '}
        </MedplumProvider>
      </MemoryRouter>
    );

    expect(screen.queryAllByPlaceholderText('bookmark name')).toHaveLength(0);
  });

  test('Render visible', async () => {
    render(
      <MemoryRouter initialEntries={['/']} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <BookmarkDialog visible={true} onCancel={jest.fn()} onOk={jest.fn()} />{' '}
        </MedplumProvider>
      </MemoryRouter>
    );
    expect(screen.queryAllByPlaceholderText('bookmark name')).not.toHaveLength(0);
  });

  test('Render and Submit', async () => {
    const onOk = jest.fn();
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

    expect(screen.queryAllByPlaceholderText('bookmark name')).not.toHaveLength(0);
  });
});
