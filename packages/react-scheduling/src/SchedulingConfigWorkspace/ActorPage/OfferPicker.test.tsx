// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '../../test-utils/render';
import { OfferPicker } from './OfferPicker';

const services: WithId<HealthcareService>[] = Array.from({ length: 25 }, (_, i) => ({
  resourceType: 'HealthcareService',
  id: `visit-${i + 1}`,
  name: `Visit ${String(i + 1).padStart(2, '0')}`,
}));

function optionNames(): string[] {
  return screen.queryAllByRole('option').map((option) => option.textContent ?? '');
}

function search(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Search visit types' });
}

describe('OfferPicker', () => {
  test('lists nothing until opened, then ten at a time, back to ten on a new search', async () => {
    render(<OfferPicker services={services} onOffer={vi.fn()} />);
    expect(screen.queryAllByRole('option', { hidden: true })).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Offer visit types' }));
    expect(optionNames()).toHaveLength(10);

    await userEvent.click(screen.getByRole('button', { name: 'Show more (15 not shown)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show more (5 not shown)' }));
    expect(optionNames()).toHaveLength(25);
    expect(screen.queryByRole('button', { name: /^Show more/ })).not.toBeInTheDocument();

    await userEvent.type(search(), 'Visit');
    expect(optionNames()).toHaveLength(10);
  });

  test('keeps what is ticked listed first when a new search would hide it, and offers it', async () => {
    const onOffer = vi.fn();
    render(<OfferPicker services={services} onOffer={onOffer} />);
    await userEvent.click(screen.getByRole('button', { name: 'Offer visit types' }));

    await userEvent.click(screen.getByRole('option', { name: 'Visit 03' }));
    await userEvent.type(search(), '2');
    expect(optionNames()).toEqual([
      'Visit 03',
      'Visit 02',
      'Visit 12',
      'Visit 20',
      'Visit 21',
      'Visit 22',
      'Visit 23',
      'Visit 24',
      'Visit 25',
    ]);
    await userEvent.click(screen.getByRole('option', { name: 'Visit 22' }));
    await userEvent.click(screen.getByRole('button', { name: 'Offer 2 visit types' }));

    expect(onOffer).toHaveBeenCalledWith([services[2], services[21]]);
  });

  test('keeps what is ticked when closed with Escape, returning focus to the button', async () => {
    render(<OfferPicker services={services} onOffer={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Offer visit types' });
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('option', { name: 'Visit 05' }));

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(button).toHaveFocus());
    await userEvent.click(button);

    expect(optionNames()[0]).toBe('Visit 05');
    expect(screen.getByRole('button', { name: 'Offer 1 visit type' })).toBeEnabled();
  });

  test('finds a visit type with no name by the label it is shown with', async () => {
    render(
      <OfferPicker services={[...services, { resourceType: 'HealthcareService', id: 'unnamed' }]} onOffer={vi.fn()} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Offer visit types' }));

    await userEvent.type(search(), 'untitled');

    expect(optionNames()).toEqual(['Untitled visit type']);
  });
});
