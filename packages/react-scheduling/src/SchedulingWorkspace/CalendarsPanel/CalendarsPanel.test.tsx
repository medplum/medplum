// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test, vi } from 'vitest';
import { render, screen, userEvent } from '../../test-utils/render';
import type { CalendarsPanelProps } from './CalendarsPanel';
import { CalendarsPanel } from './CalendarsPanel';

function setup(overrides?: Partial<CalendarsPanelProps>): void {
  const props: CalendarsPanelProps = {
    items: {
      Practitioner: [
        { id: 'prov-1', label: 'Lisa Caddy' },
        { id: 'prov-2', label: 'Michelle Bryant', selected: false },
      ],
      Device: [{ id: 'dev-1', label: 'Ultrasound Machine 1' }],
      Location: [{ id: 'room-1', label: 'Exam Room A' }],
    },
    onToggle: vi.fn(),
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

  test('clicking a Providers row fires onToggle with its actor type and item id', async () => {
    const onToggle = vi.fn();
    setup({ onToggle });

    await userEvent.click(screen.getByText('Lisa Caddy'));

    expect(onToggle).toHaveBeenCalledWith('Practitioner', 'prov-1');
  });

  test('clicking a Rooms row fires onToggle with its actor type and item id', async () => {
    const onToggle = vi.fn();
    setup({ onToggle });

    await userEvent.click(screen.getByText('Exam Room A'));

    expect(onToggle).toHaveBeenCalledWith('Location', 'room-1');
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
    setup({ items: { Practitioner: [], Device: [], Location: [] } });
    expect(screen.getByText('No providers or staff found')).toBeInTheDocument();
    expect(screen.getByText('No devices found')).toBeInTheDocument();
    expect(screen.getByText('No rooms found')).toBeInTheDocument();
  });

  test('a candidate section with no items does not show placeholder text while still loading', () => {
    setup({ items: { Practitioner: [], Device: [], Location: [] }, candidatesLoading: true });
    expect(screen.queryByText('No providers or staff found')).not.toBeInTheDocument();
    expect(screen.queryByText('No devices found')).not.toBeInTheDocument();
    expect(screen.queryByText('No rooms found')).not.toBeInTheDocument();
  });

  test('renders whatever filters it is handed, above the sections', () => {
    setup({ filters: <div>the filters</div> });
    expect(screen.getByRole('group', { name: 'Filter calendars' })).toBeInTheDocument();
    expect(screen.getByText('the filters')).toBeInTheDocument();
    expect(screen.getByText('the filters').compareDocumentPosition(screen.getByText('Providers & Staff'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  test('gives each row a button focusing on its calendar, pressed on the one focused', async () => {
    const onToggle = vi.fn();
    const onToggleFocus = vi.fn();
    setup({ onToggle, focusedId: 'room-1', onToggleFocus });

    expect(screen.getByRole('button', { name: 'Focus Exam Room A' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Focus Lisa Caddy' })).toHaveAttribute('aria-pressed', 'false');
    // The rest are dimmed, as they aren't shown.
    expect(screen.getByText('Lisa Caddy').closest('button')).toHaveAttribute('data-outside-focus');
    expect(screen.getByText('Exam Room A').closest('button')).not.toHaveAttribute('data-outside-focus');

    await userEvent.click(screen.getByRole('button', { name: 'Focus Lisa Caddy' }));
    expect(onToggleFocus).toHaveBeenCalledWith('prov-1');

    // Clicking any row leaves the focus rather than hiding the row's calendar, so no row is pressed or not.
    onToggleFocus.mockClear();
    const row = screen.getByText('Lisa Caddy').closest('button');
    expect(row).not.toHaveAttribute('aria-pressed');
    await userEvent.click(row as HTMLElement);
    expect(onToggleFocus).toHaveBeenCalledWith('room-1');
    expect(onToggle).not.toHaveBeenCalled();
  });

  test('draws a hidden row as shown while it is the one focused on, as its calendar is drawn', () => {
    setup({ focusedId: 'prov-2', onToggleFocus: vi.fn() });
    const row = screen.getByText('Michelle Bryant').closest('button') as HTMLElement;
    expect(row).toHaveAttribute('data-selected');
    expect(row.querySelector('.tabler-icon-eye-off')).toBeNull();
  });

  test('leaves the filters out entirely when none are handed over', () => {
    setup();
    expect(screen.queryByRole('group', { name: 'Filter calendars' })).not.toBeInTheDocument();
  });
});
