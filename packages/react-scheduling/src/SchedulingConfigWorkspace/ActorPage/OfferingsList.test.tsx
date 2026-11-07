// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, userEvent, within } from '../../test-utils/render';
import type { OfferingsListProps } from './OfferingsList';
import { OfferingsList } from './OfferingsList';

const services: WithId<HealthcareService>[] = Array.from({ length: 25 }, (_, i) => ({
  resourceType: 'HealthcareService',
  id: `visit-${i + 1}`,
  name: `Visit ${String(i + 1).padStart(2, '0')}`,
}));

function props(overrides: Partial<OfferingsListProps> = {}): OfferingsListProps {
  return {
    actorName: 'Dr. Jane Smith',
    offeredServices: services,
    openServiceId: null,
    onOpenServiceIdChange: vi.fn(),
    renderHeader: (service) => service.name,
    renderPanel: (service) => `Panel for ${service.name}`,
    offerableServices: [],
    onOffer: vi.fn(),
    onStopOffering: vi.fn(),
    ...overrides,
  };
}

function entryNames(): string[] {
  return screen.queryAllByRole('button', { name: /^Visit/ }).map((entry) => entry.textContent ?? '');
}

function filterInput(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Filter visit types' });
}

describe('OfferingsList', () => {
  test('lists twenty at a time, and a search narrows the list back to twenty', async () => {
    render(<OfferingsList {...props()} />);
    expect(entryNames()).toHaveLength(20);

    await userEvent.click(screen.getByRole('button', { name: 'Show more (5 not shown)' }));
    expect(entryNames()).toHaveLength(25);

    await userEvent.type(filterInput(), 'V');
    expect(entryNames()).toHaveLength(20);

    await userEvent.type(filterInput(), 'isit 1');
    expect(entryNames()).toEqual(services.slice(9, 19).map((service) => service.name));

    await userEvent.type(filterInput(), 'x');
    expect(screen.getByText('No visit types match.')).toBeInTheDocument();
  });

  test('select all takes every match, not just the page, and reads as partly checked once one is left out', async () => {
    render(<OfferingsList {...props()} />);
    const selectAll = screen.getByRole('checkbox', { name: 'Select all visit types' });

    await userEvent.click(selectAll);
    expect(screen.getByRole('button', { name: 'Stop offering 25' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Visit 02' }));
    expect(selectAll).toBePartiallyChecked();

    await userEvent.click(selectAll);
    await userEvent.click(selectAll);
    expect(screen.queryByRole('button', { name: /^Stop offering/ })).not.toBeInTheDocument();

    await userEvent.type(filterInput(), 'Visit 1');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all matching visit types' }));
    expect(screen.getByRole('button', { name: 'Stop offering 10' })).toBeInTheDocument();
  });

  test('keeps what is selected listed first when a new search would hide it', async () => {
    render(<OfferingsList {...props()} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Visit 03' }));
    await userEvent.type(filterInput(), '2');

    expect(entryNames()).toEqual(['Visit 03', 'Visit 02', 'Visit 12', ...services.slice(19).map((s) => s.name)]);
  });

  test('stopping several asks first, then hands them all over', async () => {
    const onStopOffering = vi.fn();
    render(<OfferingsList {...props({ onStopOffering })} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all visit types' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stop offering 25' }));
    const dialog = await screen.findByRole('dialog', { name: 'Stop offering 25 visit types?' });
    expect(dialog).toHaveTextContent('Dr. Jane Smith will no longer be offered for 25 visit types once you save.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop offering' }));

    expect(onStopOffering).toHaveBeenCalledWith(services);
    expect(screen.queryByRole('button', { name: /^Stop offering/ })).not.toBeInTheDocument();
  });

  test("builds an entry's panel once it is first opened, and keeps it once closed", () => {
    const renderPanel = vi.fn((service: WithId<HealthcareService>) => `Panel for ${service.name}`);
    const { rerender } = render(<OfferingsList {...props({ renderPanel })} />);
    expect(renderPanel).not.toHaveBeenCalled();

    rerender(<OfferingsList {...props({ renderPanel, openServiceId: 'visit-2' })} />);
    rerender(<OfferingsList {...props({ renderPanel, openServiceId: null })} />);

    expect(new Set(renderPanel.mock.calls.map(([service]) => service.id))).toEqual(new Set(['visit-2']));
    expect(screen.getByText('Panel for Visit 02')).toBeInTheDocument();
  });

  test('lists an entry opened from outside the list, even when the page stops short of it, and keeps it once closed', () => {
    const { rerender } = render(<OfferingsList {...props({ openServiceId: 'visit-25' })} />);
    expect(entryNames()).toContain('Visit 25');

    rerender(<OfferingsList {...props({ openServiceId: null })} />);
    expect(entryNames()).toContain('Visit 25');
  });
});
