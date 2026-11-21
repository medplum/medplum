// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test, vi } from 'vitest';
import { render, screen, userEvent, within } from '../../test-utils/render';
import { OfferAllSwitch } from './OfferAllSwitch';

describe('OfferAllSwitch', () => {
  test.each([
    [['Walk-In'], "Walk-In has no hours of its own, so it's bookable around the clock"],
    [['A', 'B', 'C', 'D', 'E', 'F', 'G'], 'A, B, C, D, E, and 2 more have no hours of their own'],
  ])('warns which visit types have no hours: %j', async (withoutHours, warning) => {
    render(
      <OfferAllSwitch
        actorName="Dr. Jane Smith"
        checked={false}
        coverage={{ total: 8, withoutHours }}
        keeping={{ kept: 0, dropped: 0, restoresEarlier: false }}
        onChange={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('switch', { name: /^Offer all visit types/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Offer all visit types?' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(warning);
  });
});
