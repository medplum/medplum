// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test, vi } from 'vitest';
import { render, screen, userEvent } from '../../test-utils/render';
import type { CalendarsPanelProps } from './CalendarsPanel';
import { CalendarsPanel } from './CalendarsPanel';

function setup(overrides?: Partial<CalendarsPanelProps>): void {
  const props: CalendarsPanelProps = {
    providers: [
      { id: 'prov-1', label: 'Lisa Caddy', color: 'blue' },
      { id: 'prov-2', label: 'Michelle Bryant', color: 'teal', selected: false },
    ],
    devices: [{ id: 'dev-1', label: 'Ultrasound Machine 1', color: 'pink' }],
    rooms: [{ id: 'room-1', label: 'Exam Room A', color: 'grape' }],
    onToggleProvider: vi.fn(),
    onToggleDevice: vi.fn(),
    onToggleRoom: vi.fn(),
    ...overrides,
  };
  render(<CalendarsPanel {...props} />);
}

describe('CalendarsPanel', () => {
  test('renders the panel title and all section titles', () => {
    setup();
    expect(screen.getByText('Calendars')).toBeInTheDocument();
    expect(screen.getByText('Providers & Staff')).toBeInTheDocument();
    expect(screen.getByText('Devices')).toBeInTheDocument();
    expect(screen.getByText('Rooms')).toBeInTheDocument();
  });

  test('renders all row labels', () => {
    setup();
    expect(screen.getByText('Lisa Caddy')).toBeInTheDocument();
    expect(screen.getByText('Michelle Bryant')).toBeInTheDocument();
    expect(screen.getByText('Ultrasound Machine 1')).toBeInTheDocument();
    expect(screen.getByText('Exam Room A')).toBeInTheDocument();
  });

  test('clicking a Providers row fires onToggleProvider with the item id', async () => {
    const onToggleProvider = vi.fn();
    setup({ onToggleProvider });

    await userEvent.click(screen.getByText('Lisa Caddy'));

    expect(onToggleProvider).toHaveBeenCalledWith('prov-1');
  });

  test('a deselected row is aria-pressed=false and shows an eye-off icon', () => {
    setup();
    const selectedRow = screen.getByText('Lisa Caddy').closest('button');
    const deselectedRow = screen.getByText('Michelle Bryant').closest('button');
    expect(selectedRow).toHaveAttribute('aria-pressed', 'true');
    expect(deselectedRow).toHaveAttribute('aria-pressed', 'false');
  });

  test('collapsing a section flips its header toggle aria-label', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Hide rooms' }));

    expect(screen.getByRole('button', { name: 'Show rooms' })).toBeInTheDocument();
  });

  test('candidatesLoading shows a loading indicator on the Providers & Staff, Devices, and Rooms sections', () => {
    setup({ candidatesLoading: true });
    expect(screen.getByLabelText('Loading providers & staff')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading devices')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading rooms')).toBeInTheDocument();
  });

  test('an empty section shows dim placeholder text instead of a list', () => {
    setup({ providers: [], devices: [], rooms: [] });
    expect(screen.getByText('No providers or staff found')).toBeInTheDocument();
    expect(screen.getByText('No devices found')).toBeInTheDocument();
    expect(screen.getByText('No rooms found')).toBeInTheDocument();
  });

  test('a candidate section with no items does not show placeholder text while still loading', () => {
    setup({ providers: [], devices: [], rooms: [], candidatesLoading: true });
    expect(screen.queryByText('No providers or staff found')).not.toBeInTheDocument();
    expect(screen.queryByText('No devices found')).not.toBeInTheDocument();
    expect(screen.queryByText('No rooms found')).not.toBeInTheDocument();
  });
});
