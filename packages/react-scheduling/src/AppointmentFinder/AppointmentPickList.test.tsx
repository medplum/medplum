// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { AppointmentPickListProps } from './AppointmentPickList';
import { AppointmentPickList } from './AppointmentPickList';

const ITEMS = [
  { id: 'main', label: 'Uro Associates - Main Clinic', description: 'Boston, MA' },
  { id: 'satellite', label: 'Uro Associates - Satellite' },
];

function setup(props: Partial<AppointmentPickListProps>): void {
  render(
    <AppointmentPickList
      label="Location"
      items={ITEMS}
      query=""
      emptyMessage="No sites found."
      onSelect={vi.fn()}
      onQueryChange={vi.fn()}
      {...props}
    />
  );
}

describe('AppointmentPickList', () => {
  test('Offers one row per item, described where there is anything to say', () => {
    setup({});

    expect(screen.getByRole('radiogroup', { name: 'Location' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Uro Associates - Main Clinic/ })).toBeInTheDocument();
    expect(screen.getByText('Boston, MA')).toBeInTheDocument();
  });

  test('Only one row can be chosen, and says which it is', () => {
    setup({ selectedId: 'satellite' });

    expect(screen.getByRole('radio', { name: /Satellite/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Main Clinic/ })).not.toBeChecked();
  });

  test('Reports the row that was clicked', async () => {
    const onSelect = vi.fn();
    setup({ onSelect });

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: /Main Clinic/ }));
    });

    expect(onSelect).toHaveBeenCalledWith('main');
  });

  test('Reports what is typed into the search', async () => {
    const onQueryChange = vi.fn();
    setup({ onQueryChange });

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Search location' }), { target: { value: 'Satel' } });
    });

    expect(onQueryChange).toHaveBeenCalledWith('Satel');
  });

  test('Says when there is nothing to choose from', () => {
    setup({ items: [] });

    expect(screen.getByText('No sites found.')).toBeInTheDocument();
    // The group stays, since it carries the label. What goes is the rows.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  test('Withholds the rows while loading rather than saying there are none', () => {
    setup({ items: [], loading: true });

    expect(screen.queryByText('No sites found.')).not.toBeInTheDocument();
  });

  test('Shows why the list could not be loaded', () => {
    setup({ items: [], error: 'Network request failed' });

    expect(screen.getByText('Could not load location')).toBeInTheDocument();
    expect(screen.getByText('Network request failed')).toBeInTheDocument();
    expect(screen.queryByText('No sites found.')).not.toBeInTheDocument();
  });

  test('Leaves out the search when the caller cannot use it', () => {
    setup({ onQueryChange: undefined });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Main Clinic/ })).toBeInTheDocument();
  });

  test('Says what the list has been narrowed to, when it has', () => {
    setup({ footnote: 'Showing visit types offered at Uro Associates - Main Clinic.' });

    expect(screen.getByText(/Showing visit types offered at/)).toBeInTheDocument();
  });
});
