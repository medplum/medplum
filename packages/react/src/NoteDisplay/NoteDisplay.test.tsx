import { MockClient } from '@medplum/mock';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { NoteDisplay, NoteDisplayProps } from './NoteDisplay';

const medplum = new MockClient();

describe('NoteDisplay', () => {
  function setup(args: NoteDisplayProps): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <NoteDisplay {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders array', async () => {
    await act(async () => {
      setup({ value: [{ text: 'Hello World' }, { text: 'Goodbye Moon' }] });
    });

    expect(screen.getByText('Hello World')).toBeDefined();
    expect(screen.getByText('Goodbye Moon')).toBeDefined();
  });

  test('Renders author by reference', async () => {
    await act(async () => {
      setup({
        value: [{ text: 'Hello World', authorReference: { display: 'Medplum Bots' } }],
      });
    });

    expect(screen.getByText('Medplum Bots')).toBeDefined();
  });

  test('Renders author by value', async () => {
    await act(async () => {
      setup({
        value: [{ text: 'Hello World', authorString: 'Medplum Bots' }],
      });
    });

    expect(screen.getByText('Medplum Bots')).toBeDefined();
  });
});
