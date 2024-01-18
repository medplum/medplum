import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { RequestGroupDisplay } from './RequestGroupDisplay';

const medplum = new MockClient();

async function setup(ui: ReactElement): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{ui}</MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('RequestGroupDisplay', () => {
  test('Renders undefined', async () => {
    await setup(<RequestGroupDisplay onStart={jest.fn()} onEdit={jest.fn()} />);
  });

  test('Renders reference', async () => {
    const onStart = jest.fn();
    const onEdit = jest.fn();

    await setup(
      <RequestGroupDisplay
        onStart={onStart}
        onEdit={onEdit}
        value={{ reference: 'RequestGroup/workflow-request-group-1' }}
      />
    );

    expect(screen.getByText('Patient Registration')).toBeDefined();

    const startButtons = screen.getAllByText('Start');
    expect(startButtons).toHaveLength(2);

    const editButtons = screen.getAllByText('Edit');
    expect(editButtons).toHaveLength(1);

    fireEvent.click(startButtons[0]);
    expect(onStart).toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();

    onStart.mockClear();
    onEdit.mockClear();

    fireEvent.click(editButtons[0]);
    expect(onStart).not.toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalled();
  });
});
