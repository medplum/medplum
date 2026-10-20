// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Schedule } from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule, MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, userEvent, waitFor } from '../../test-utils/render';
import { renderSettingsPage } from './settingsTestUtils';
import { VisitServiceTypesSettingsPage } from './VisitServiceTypesSettingsPage';

const otherSchedule: Schedule = {
  resourceType: 'Schedule',
  id: 'schedule-other',
  actor: [{ reference: 'Practitioner/other', display: 'Bob Jones' }],
};

describe('VisitServiceTypesSettingsPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient({ profile: DrAliceSmith });
    vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string) =>
      resourceType === 'Schedule' ? [otherSchedule, DrAliceSmithSchedule] : []) as any);
  });

  test("defaults to the signed-in user's calendar", async () => {
    await renderSettingsPage(medplum, <VisitServiceTypesSettingsPage />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Calendar' })).toHaveValue('Alice Smith'));
    expect(await screen.findByText('No visit service types found.')).toBeInTheDocument();
  });

  test('keeps the selected calendar in the URL', async () => {
    const user = userEvent.setup();
    const { router } = await renderSettingsPage(medplum, <VisitServiceTypesSettingsPage />);

    await user.click(await screen.findByRole('textbox', { name: 'Calendar' }));
    await user.click(await screen.findByRole('option', { name: 'Bob Jones', hidden: true }));

    await waitFor(() => expect(router.state.location.search).toBe('?schedule=schedule-other'));
  });

  test('shows an empty state with no calendars', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    await renderSettingsPage(medplum, <VisitServiceTypesSettingsPage />);
    expect(await screen.findByText('No calendars yet. Create one from the Schedule page.')).toBeInTheDocument();
  });
});
